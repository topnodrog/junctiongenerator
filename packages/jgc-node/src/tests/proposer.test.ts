import {
  isExpectedBlockProposer,
  proposerDraw,
  selectBlockProposer,
} from "../consensus/proposer.js";
import type { ValidatorStakeSnapshot } from "../consensus/validator-bonds.js";

const previousHash = "0123456789abcdef".repeat(4);
const snapshot: ValidatorStakeSnapshot = {
  height: 144,
  root: "abcdef0123456789".repeat(4),
  validators: [
    { validatorId: "validator-b", bondedStake: 30n, outpoints: [] },
    { validatorId: "validator-a", bondedStake: 70n, outpoints: [] },
  ],
};

describe("deterministic stake-weighted proposer schedule", () => {
  test("matches the published draw vector", () => {
    expect(proposerDraw(snapshot, previousHash, 145).toString(16)).toBe(
      "af9671f1bbb159258af6f049b270510de0fbd028f9e6b7f557f974d29fa68e0f",
    );
  });

  test("is independent of validator input order and names the expected proposer", () => {
    const reordered = { ...snapshot, validators: [...snapshot.validators].reverse() };
    const proposer = selectBlockProposer(snapshot, previousHash, 145);
    expect(proposer).toBe(selectBlockProposer(reordered, previousHash, 145));
    expect(isExpectedBlockProposer(snapshot, previousHash, 145, proposer!)).toBe(true);
    expect(isExpectedBlockProposer(snapshot, previousHash, 145, "not-selected")).toBe(false);
  });

  test("returns null when no validator has stake", () => {
    expect(selectBlockProposer({ ...snapshot, validators: [] }, previousHash, 145)).toBeNull();
  });

  test("rejects malformed consensus inputs and duplicate identities", () => {
    expect(() => proposerDraw(snapshot, "bad", 145)).toThrow(/32-byte hex hash/);
    expect(() => proposerDraw(snapshot, previousHash, -1)).toThrow(/non-negative/);
    expect(() => selectBlockProposer({
      ...snapshot,
      validators: [...snapshot.validators, { ...snapshot.validators[0]! }],
    }, previousHash, 145)).toThrow(/duplicate validator id/);
  });
});
