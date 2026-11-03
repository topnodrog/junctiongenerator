#!/usr/bin/env node
/**
 * Offline signer for gate evidence records and mainnet launch records.
 *
 * The private key never enters the repository. Run this on an air-gapped or
 * operator-controlled machine, then commit only the resulting envelope JSON.
 * `signPayload` uses canonical, sorted JSON so signature verification is stable.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const control = await import(new URL("../dist/config/mainnet-launch-control.js", import.meta.url));

function flag(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required`);
  return process.argv[index + 1];
}

function optionalFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const payloadPath = resolve(flag("--payload"));
const keyPath = resolve(flag("--key"));
const keyId = flag("--key-id");
const outPath = resolve(flag("--out"));
const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
const privateKeyPem = readFileSync(keyPath, "utf8");
const signature = control.signPayload(payload, privateKeyPem, keyId);

let envelope;
if (optionalFlag("--append", "false") === "true" && existsSync(outPath)) {
  envelope = JSON.parse(readFileSync(outPath, "utf8"));
  if (control.canonicalJson(envelope.payload) !== control.canonicalJson(payload)) {
    throw new Error("--append requires an identical canonical payload");
  }
  if (envelope.signatures.some((entry) => entry.keyId === keyId)) {
    throw new Error(`envelope already has a signature from ${keyId}`);
  }
  envelope.signatures.push(signature);
} else {
  envelope = { payload, signatures: [signature] };
}
writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
console.log(`Signed ${payload.kind ?? "payload"} as ${keyId}; envelope: ${outPath}`);
