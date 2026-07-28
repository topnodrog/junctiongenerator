import { createHash } from "crypto";
import type { Hash256 } from "../types/index.js";
import type { UTXOSet } from "./utxo.js";
import type { AuditValidator } from "../broker/audit-schedule.js";
import { compareCanonicalBytes } from "../protocol/canonical.js";

// ASCII "JGCBOND" + version 1. The remainder is:
// validator-id length (u16 BE) | UTF-8 validator id | ordinary spend script.
const BOND_PREFIX = Buffer.from("JGCBOND\x01", "binary");

export interface ValidatorBond {
  validatorId: string;
  bondedStake: bigint;
  outpoints: Array<{ txid: Hash256; vout: number }>;
}

export interface ValidatorStakeSnapshot {
  height: number;
  root: Hash256;
  validators: ValidatorBond[];
}

/** Wrap a normal owner script in a consensus-visible validator bond covenant. */
export function validatorBondScript(validatorId: string, ownerScriptPubKey: string): string {
  const id = Buffer.from(validatorId, "utf8");
  if (id.length === 0 || id.length > 4096) throw new Error("validator id must be 1..4096 UTF-8 bytes");
  if (!/^[0-9a-f]*$/i.test(ownerScriptPubKey) || ownerScriptPubKey.length % 2 !== 0) {
    throw new Error("owner script must be hex");
  }
  const len = Buffer.allocUnsafe(2);
  len.writeUInt16BE(id.length);
  return Buffer.concat([BOND_PREFIX, len, id, Buffer.from(ownerScriptPubKey, "hex")]).toString("hex");
}

export function parseValidatorBondScript(script: string): { validatorId: string; ownerScriptPubKey: string } | null {
  if (!/^[0-9a-f]+$/i.test(script) || script.length % 2 !== 0) return null;
  const bytes = Buffer.from(script, "hex");
  if (bytes.length < BOND_PREFIX.length + 3 ||
      !bytes.subarray(0, BOND_PREFIX.length).equals(BOND_PREFIX)) return null;
  const length = bytes.readUInt16BE(BOND_PREFIX.length);
  const idStart = BOND_PREFIX.length + 2;
  const scriptStart = idStart + length;
  if (length === 0 || scriptStart >= bytes.length) return null;
  const validatorId = bytes.subarray(idStart, scriptStart).toString("utf8");
  if (Buffer.from(validatorId, "utf8").length !== length) return null;
  return { validatorId, ownerScriptPubKey: bytes.subarray(scriptStart).toString("hex") };
}

/**
 * Derive the bonded roster exclusively from active-chain UTXOs. Creating a
 * tagged output bonds value; spending it unbonds. Reorg and restart behavior
 * therefore comes from the existing consensus-owned UTXO transition.
 */
export function validatorStakeSnapshot(utxos: UTXOSet, height: number): ValidatorStakeSnapshot {
  const byId = new Map<string, ValidatorBond>();
  for (const { txid, vout, entry } of utxos.entries()) {
    const parsed = parseValidatorBondScript(entry.scriptPubKey);
    if (!parsed) continue;
    const bond = byId.get(parsed.validatorId) ?? {
      validatorId: parsed.validatorId, bondedStake: 0n, outpoints: [],
    };
    bond.bondedStake += entry.value;
    bond.outpoints.push({ txid, vout });
    byId.set(parsed.validatorId, bond);
  }
  const validators = [...byId.values()].sort((a, b) => compareCanonicalBytes(a.validatorId, b.validatorId));
  for (const bond of validators) {
    bond.outpoints.sort((a, b) => compareCanonicalBytes(a.txid, b.txid) || a.vout - b.vout);
  }
  const hash = createHash("sha3-256").update("jgc-validator-stake-snapshot-v1");
  hash.update(String(height));
  for (const bond of validators) {
    hash.update(bond.validatorId).update(bond.bondedStake.toString());
    for (const outpoint of bond.outpoints) hash.update(outpoint.txid).update(String(outpoint.vout));
  }
  return { height, root: hash.digest("hex"), validators };
}

export function auditValidatorsFromSnapshot(snapshot: ValidatorStakeSnapshot): AuditValidator[] {
  return snapshot.validators.map((bond) => ({
    validatorId: bond.validatorId,
    bondedStake: bond.bondedStake,
    active: true,
  }));
}
