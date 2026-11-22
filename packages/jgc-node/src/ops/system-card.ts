import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism, freemem, totalmem } from "node:os";
import { join } from "node:path";
import { TESTNET_GENESIS_HASH, TESTNET_NETWORK } from "../config/networks.js";
import { quantumAddressFromPublicKey, quantumSignHash, quantumVerifyHashSignature } from "../crypto/pq.js";
import { Wallet } from "../wallet/wallet.js";
import type { RecoveryPrompts } from "../wallet/onboarding.js";

export const DAY = 24 * 60 * 60 * 1000;
export const PILOT_TERMS = [
  "I control this machine and choose the allocation below. Closing this foreground process or pressing Ctrl+C ends the trial.",
  "CPU means local hashing workers. RAM means MiB of touched demonstration buffers. The operating system schedules the workers.",
  "The node also uses ordinary runtime memory, network traffic and disk for chain data. These overheads are outside the selected workload amounts.",
  "I may pause at any time or reserve a four-hour daily break. Pausing stops the node, its work and new receipts. My signed deadline keeps advancing.",
  "No GPU, disk space or bandwidth is offered for contracts. No customer payload, remote commands or automatic renewal.",
  "In the first full-allocation trial the demonstration uses the selected workload continuously until the deadline or my earlier stop. I may explicitly add one shared day after that deadline.",
  "In shared sessions the demonstration uses the entire signed allocation for the first 15 seconds of each minute and releases it between jobs.",
  "My public testnet address and signed slot receipts are visible to peers. My diagnostic, card and five-minute peer/chain observations stay on this computer unless I share them.",
  "Today the zero-value JGTC chain divides epoch issuance by accepted receipt weight. More hardware gives no extra receipt weight.",
  "Proposed launch policy: before launch, allocate one full era-0 day of issuance (7,200 JGC) per verified 24-hour cohort window, divided among eligible people. Pending audits and a separately approved genesis, eligible JGTC would exchange 1:1 for JGC.",
  "The proposed conversion has no funded reserve or active redemption. JGC would trade at market prices; the proposed policy uses proceeds remaining after expenses to buy and burn JGC.",
].join("\n");

export function diagnose() {
  const logicalCpus = availableParallelism();
  const availableMiB = Math.floor(freemem() / 1048576);
  return {
    logicalCpus, totalMiB: Math.floor(totalmem() / 1048576), availableMiB,
    maxWorkers: Math.max(0, Math.min(4, logicalCpus - 1)),
    maxBufferMiB: Math.max(0, Math.min(512, Math.floor((availableMiB - 1024) / 2))),
  };
}

export function allocation(workers: number, bufferMiB: number, caps: ReturnType<typeof diagnose>,
  now: number, firstFullAt?: number) {
  if (!Number.isInteger(workers) || workers < 0 || workers > caps.maxWorkers ||
      !Number.isInteger(bufferMiB) || bufferMiB < 0 || bufferMiB > caps.maxBufferMiB ||
      workers + bufferMiB === 0) throw new Error("Choose at least one resource within the displayed limits");
  if (firstFullAt !== undefined && (!Number.isSafeInteger(firstFullAt) || firstFullAt < 0 || firstFullAt > now)) {
    throw new Error("Invalid first-trial timestamp; check the local clock and trial record");
  }
  const full = (workers > 0 && workers === caps.maxWorkers) || (bufferMiB > 0 && bufferMiB === caps.maxBufferMiB);
  const first = full && (firstFullAt === undefined || now < firstFullAt + DAY);
  return { workers, bufferMiB, mode: first ? "first-full" as const : "shared" as const,
    startsAt: now, expiresAt: first ? (firstFullAt ?? now) + DAY : now + DAY };
}

export type Allocation = ReturnType<typeof allocation> & { sharedUntil?: number };

/** Independently verify the exact terms and public identity in a local consent record. */
export function verifyCard(record: { card: { version: number; network: string; address: string };
  publicKey: string; signature: string }): boolean {
  const { card, publicKey, signature } = record;
  return card.version === 1 && card.network === TESTNET_NETWORK.chainId &&
    quantumVerifyHashSignature(signature, createHash("sha256").update(JSON.stringify(card)).digest(), publicKey) &&
    quantumAddressFromPublicKey(publicKey) === card.address;
}

export async function enroll(io: RecoveryPrompts, directory: string, keystore: string, seeds: string[],
  caps: ReturnType<typeof diagnose>) {
  const wallet = Wallet.fromKeystore(JSON.parse(readFileSync(keystore, "utf8")),
    await io.secret("Dedicated testnet wallet password (hidden): "));
  if (wallet.recoveryNetwork() !== TESTNET_NETWORK.chainId) throw new Error("A testnet recovery wallet is required");
  const label = wallet.labels()[0];
  const address = wallet.address(label);
  io.show(JSON.stringify(caps, null, 2));
  io.show(PILOT_TERMS);
  const choose = async (question: string) => {
    const answer = (await io.acknowledge(question)).trim();
    if (!/^\d+$/.test(answer)) throw new Error("Enter a whole number, including 0 to decline");
    return Number(answer);
  };
  const workers = await choose(`CPU workers [0..${caps.maxWorkers}]: `);
  const bufferMiB = await choose(`Workload RAM MiB [0..${caps.maxBufferMiB}]: `);
  const marker = join(directory, "first-full.json");
  const firstFullAt = existsSync(marker) ? JSON.parse(readFileSync(marker, "utf8")) : undefined;
  const selected: Allocation = allocation(workers, bufferMiB, caps, Date.now(), firstFullAt);
  if (selected.mode === "first-full") {
    const followOn = await io.acknowledge("After the full trial, type SHARE for one additional shared day, or press Enter to stop at the deadline: ");
    if (followOn === "SHARE") selected.sharedUntil = selected.expiresAt + DAY;
    else if (followOn !== "") throw new Error("Expected SHARE or an empty response");
  }
  const card = { version: 1, id: randomUUID(), network: TESTNET_NETWORK.chainId, genesis: TESTNET_GENESIS_HASH,
    address, seeds, maxWorkers: caps.maxWorkers, maxBufferMiB: caps.maxBufferMiB, terms: PILOT_TERMS, ...selected };
  io.show(JSON.stringify({ address, seeds, directory, ...selected, allocationEndsUTC: new Date(selected.expiresAt).toISOString(),
    nodeStopsUTC: new Date(selected.sharedUntil ?? selected.expiresAt).toISOString() }, null, 2));
  if (await io.acknowledge("Type ACCEPT to sign this exact card and start, or press Enter to cancel: ") !== "ACCEPT") {
    throw new Error("Enrollment cancelled");
  }
  if (Date.now() >= selected.expiresAt) throw new Error("Trial expired during enrollment");
  const privateKey = wallet.privateKey(label);
  const publicKey = wallet.publicKey(label);
  const hash = createHash("sha256").update(JSON.stringify(card)).digest();
  const signature = quantumSignHash(privateKey, hash);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (selected.mode === "first-full" && firstFullAt === undefined) {
    writeFileSync(marker, JSON.stringify(selected.startsAt), { flag: "wx", mode: 0o600 });
  }
  const receipt = join(directory, `card-${card.id}.json`);
  writeFileSync(receipt, JSON.stringify({ card, publicKey, signature }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  io.show(`Signed system card: ${receipt}`);
  return { selected, id: card.id, identity: { address, publicKey, privateKey, version: 1 as const, createdAt: new Date().toISOString() } };
}
