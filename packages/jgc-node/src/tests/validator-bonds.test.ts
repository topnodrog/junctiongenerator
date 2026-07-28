import { UTXOSet } from "../consensus/utxo.js";
import {
  parseValidatorBondScript,
  validatorBondScript,
  validatorStakeSnapshot,
  auditValidatorsFromSnapshot,
} from "../consensus/validator-bonds.js";

const owner = "ab".repeat(64);
const tx = (n: number) => n.toString(16).padStart(64, "0");

describe("consensus-owned validator bonds", () => {
  test("round-trips the validator identity and owner spend script", () => {
    const script = validatorBondScript("validator-a", owner);
    expect(parseValidatorBondScript(script)).toEqual({
      validatorId: "validator-a", ownerScriptPubKey: owner,
    });
    expect(parseValidatorBondScript(owner)).toBeNull();
  });

  test("aggregates only active-chain unspent bond outputs into a stable snapshot", () => {
    const set = new UTXOSet();
    set.add(tx(1), 0, { value: 40n, scriptPubKey: validatorBondScript("validator-a", owner), height: 1, isCoinbase: false });
    set.add(tx(2), 1, { value: 60n, scriptPubKey: validatorBondScript("validator-a", owner), height: 2, isCoinbase: false });
    set.add(tx(3), 0, { value: 25n, scriptPubKey: validatorBondScript("validator-b", owner), height: 2, isCoinbase: false });
    set.add(tx(4), 0, { value: 999n, scriptPubKey: owner, height: 2, isCoinbase: false });

    const before = validatorStakeSnapshot(set, 2);
    expect(before.validators.map(v => [v.validatorId, v.bondedStake])).toEqual([
      ["validator-a", 100n], ["validator-b", 25n],
    ]);
    expect(auditValidatorsFromSnapshot(before)[0]!.bondedStake).toBe(100n);

    set.spend(tx(2), 1); // ordinary UTXO spending is unbonding
    const after = validatorStakeSnapshot(set, 3);
    expect(after.validators[0]!.bondedStake).toBe(40n);
    expect(after.root).not.toBe(before.root);
  });
});
