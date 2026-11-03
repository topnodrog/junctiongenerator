# JGC node security review — inside and out

**Reviewed:** 2026-11-02
**Scope:** `packages/jgc-node/src` (~25,500 lines of TypeScript), `packages/jgc-node/rust`, Dockerfile/Compose, `deploy/`, release scripts, `.github/workflows`, `worker/worker.js` + helpers, `src/proxy.ts` CSP, contracts and the mainnet readiness guard.
**Method:** manual source review of consensus, crypto, network, storage, wallet, ops and launch paths; validated with the full Jest suite, new adversarial tests, release checks and the new infra/launch guards. No external cryptographic audit was performed. This is **not** the `independentSecurityReview` gate.

## 1. Executive result

| Severity | Fixed in this pass | Open (protocol work) | Accepted residual |
| --- | --- | --- | --- |
| Critical | 0 | 3 | 0 |
| High | 4 | 5 | 1 |
| Medium | 5 | 2 | 2 |
| Low / informational | 0 | 1 | 3 |

**Conclusion:** the node is a well-instrumented zero-value testnet prototype with a deliberately fail-closed mainnet guard. It is **not** a launchable value-bearing chain. The three critical open issues (placeholder proving keys, simulation-only PQ receipts, non-shielded payments) are structural; no configuration change or readiness boolean can close them.

The most important new security property is that *launch authority is now cryptographic*: an empty policy, an unsigned record, a missing evidence ledger, a placeholder proof registry or a mismatched chain identity all fail closed.

---

## 2. Findings fixed in this pass

### H-01 — Arbitrary-origin CORS reflection + Private Network Access (High, fixed)

`src/network/status-server.ts` previously did:

```ts
res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
if (req.headers["access-control-request-private-network"] === "true")
  res.setHeader("Access-Control-Allow-Private-Network", "true");
```

Any web page could answer a PNA preflight and read `http://127.0.0.1:7777/status` from a visitor's browser, exposing the watched address, balances, role, producer errors and uptime. Fix: exact origin allowlist (`JGC_STATUS_ALLOWED_ORIGINS`), `403` for unknown origins, PNA only for allowlisted origins on a loopback bind, and security headers (`nosniff`, `no-referrer`, `default-src 'none'`, `no-store`). Regression: `src/tests/status-server-security.test.ts`.

### H-02 — Private status reachable on a public bind (High, fixed)

`compose.testnet.yml`, the legacy seed deployments and `Dockerfile` all set `JGC_STATUS_HOST=0.0.0.0`. `/status` and `/` shared that listener with the public `/explorer` route. A reverse-proxy misconfiguration (or a published port) would leak operator state. Fix: private routes return `404` on any non-loopback bind; `JGC_PUBLIC_API_PORT` starts a second, `publicApiOnly` listener with just `/healthz`, `/explorer`, `/balance`; explicit `statusToken` is mandatory if an operator deliberately re-enables private status remotely. `deploy/selfhosted/Caddyfile` also hard-blocks `/status`.

### H-03 — Placeholder Groth16 verifying keys were launchable (Critical → enforced blocker, fixed at the gate)

`src/crypto/zkp.ts` exports a mutable `CIRCUIT_REGISTRY` whose entries are e.g. `"0x" + "a1".repeat(32)` — 32 bytes, not a 64-byte G1 point — with comments saying "replace with ceremony output". Any code path (including demos) can `CIRCUIT_REGISTRY.set(...)`. Fix: `src/crypto/proof-registry.ts` requires full-length G1/G2 points, `numPublicInputs + 1` IC points, a ceremony transcript digest with ≥2 participants, ≥2 external reviewer key IDs and a `no-unresolved-high-or-critical` attestation. `npm run proof:registry -- --check` and `npm run mainnet:launch` fail while the compiled-in registry or a placeholder manifest is in use. Tests: `src/tests/proof-registry.test.ts`.

> Residual: the release binary must actually *load* the reviewed manifest at startup. That is enforced as a `reproducibleArtifacts` artifact (`verifier-binary`) and a `proofSystem` artifact, not by this preflight alone. See the launch plan.

### H-04 — Unsigned in-memory readiness override (High, fixed at the launcher)

`JGCNode` calls `assertMainnetLaunchAllowed(config.mainnetReadiness)`. A caller able to construct a node could supply `status: "ready"` with all gates true, bypassing the checked-in baseline. Fix: `src/config/mainnet-launch-control.ts` adds an M-of-N Ed25519-signed, expiring, release-specific launch record bound to the evidence ledger digest, reviewed proof registry digest, artifact digest, compiled network identity, genesis hash and readiness record. `deploy/selfhosted/launch-policy.json` has zero trusted keys, so no signature can pass today. Tests: `src/tests/mainnet-launch-control.test.ts`.

> Residual: `JGCNode` itself still accepts an in-memory record for unit-testability. A future release should remove the override entirely or require the verified envelope. Tracked as a `reproducibleArtifacts` review item.

### M-05 — Any `*.vercel.app` origin was trusted (Medium, fixed)

`worker/worker.js` reflected every `https://*.vercel.app` origin, and any Vercel account can host an attacker-controlled page there. Fix: `worker/cors.mjs` uses an exact allowlist; previews must be explicitly listed in `ALLOWED_PREVIEW_ORIGINS`. Tests: `worker/cors.test.mjs` (added to `website-ci.yml`).

### M-06 — Unvalidated bootstrap URLs (Medium, fixed)

`JGC_SEEDS`, `--seed`, `--advertise` and the runner Compose file accepted any string. Cleartext `ws://` on a public host, embedded credentials, query strings and unbounded/duplicate lists were possible. Fix: `validatePeerUrl()` in `src/config/testnet-options.ts` requires `wss://` for public hosts, rejects credentials/query/fragments, caps the list at 32 and rejects duplicates; `ws://` remains available only for loopback, RFC 1918 and single-label container names. Tests extended in `testnet-options.test.ts`.

### M-07 — Active Fly.io/Google Cloud dependency (Medium, fixed)

A scheduled workflow used `FLY_API_TOKEN`; `package.json`, `compose.runner.yml`, the Windows installer and `stage-runner-release.mjs` hard-coded `wss://jgc-testnet-seed-b.fly.dev`; the hosted monitor called Cloud Scheduler, GCS and Gemini APIs. Fix: the scheduled workflow is deleted; `infra-guard.yml` + `scripts/infra-guard.mjs` reject cloud hostnames, CLIs and credentials in the active kit; release seeds are `JGC_RELEASE_SEEDS`/`-Seeds`; `compose.runner.yml` requires `JGC_SEEDS`; `monitor.mjs` is dependency-free and cloud-free. Legacy directories are documented as archived.

### M-08 — Hosted monitor could make operational decisions (Medium, fixed for new deployments)

`deploy/monitor/server.mjs` used a model to review evidence and could pause its own scheduler through a cloud IAM token; model output was explicitly non-authoritative in docs but the code path existed. New deployments use `deploy/selfhosted/monitor.mjs`, which only polls read-only endpoints, never uses a model, never mutates anything, and has injectable tests (`monitor.test.mjs`).

### M-12 — Unbounded simultaneous inbound sockets (Medium, fixed)

Per-peer frame and queue limits did not bound the *number* of inbound
WebSockets. Thousands of idle connections from many source addresses could
allocate a socket and a serialized-processing pipeline before `connectPeer()`
applied `maxPeers` and the peer guard. Fix: `MAX_INBOUND_SOCKETS = 64` in
`src/network/transport.ts`, checked in the `connection` handler before
`attachSocket`, with an injectable per-server override. Regression:
`src/tests/transport-bounds.test.ts` (2-socket bound test + invalid-bound test).

---

## 3. Open protocol findings (block launch)

| ID | Severity | Component | Finding | Gate |
| --- | --- | --- | --- | --- |
| C-01 | Critical | `src/crypto/zkp.ts`, `src/crypto/compute-proof.ts` | Strict mode's registry contains placeholder keys; `simnet` skips the pairing check and uses an accept-all JS stub. The declared mainnet mode `strict-groth16-v1` is not post-quantum. | `proofSystem`, `postQuantumSecurity` |
| C-02 | Critical | `src/crypto/pq-zkp.ts`, `src/crypto/pq.ts` | Hash/Merkle research receipts are explicitly simulation-only and cannot prove useful computation. The isolated Triton experiment proves only a bounded arithmetic relation with no notes, ownership or nullifiers. | `proofSystem`, `postQuantumSecurity` |
| C-03 | Critical | `src/crypto/pq-stealth.ts`, `src/consensus/utxo.ts` | Amounts and spends are public, the sender knows the spending seed, and the historically named viewing secret grants spending authority. There are no encrypted notes, commitments, nullifiers or confidential value conservation. | `paymentPrivacy` |
| H-05 | High | `src/crypto/pq-signatures.ts` | Wallet address commitments are truncated to 20 bytes; ML-DSA alone does not make backup encryption, transport confidentiality or upgrade keys quantum-safe. | `postQuantumSecurity` |
| H-06 | High | `src/network/designated-producer.ts`, `src/consensus/proposer.ts`, `src/network/node.ts` | Production still depends on a designated producer; the deterministic proposer schedule is a primitive not enforced by validation or fork choice; proposer identity is not bound into the block header. | `permissionlessProduction` |
| H-07 | High | `src/consensus/validator-bonds.ts`, `src/consensus/emission.ts` | Bonds, rewards and slashing are not consensus-owned or economically activated; no adversarial reward/slash tests at an activation height. | `validatorEconomics` |
| H-08 | High | `src/broker/assigned-work.ts`, `src/network/node.ts` | Useful-work funding is a local synthetic-credit journal with no remote authenticated enrollment, real deposits, confidential inputs, exactly-once consensus settlement or storage availability challenges. Inputs are plaintext. | `usefulServices`, `governance` |
| M-09 | Medium | `scripts/release-manifest.mjs`, `Dockerfile` | Content-addressed manifests exist but no signed binaries/containers, SBOM, pinned compiler or two independent matching rebuilds. The Docker image pins Node 22.23.2 and builds with `npm ci`, which is good but not yet reproducible evidence. | `reproducibleArtifacts` |
| M-10 | Medium | `src/storage/*`, `src/broker/assigned-work.ts` | Journals recover torn tails and reject corrupt checksums, but a malicious/compromised storage operator can still roll back or truncate history; there are no external checkpoints or transactional production store. | `usefulServices`, `soloSoak` |
| H-09 | High | `src/config/mainnet-readiness.ts`, `src/consensus/emission.ts`, `src/network/public-testnet-api.ts` | Owner proposed a 3–5 week genesis allocation (151,200–252,000 JGC) to fund reviews and bounties. The current chain/testnet claims zero premine, supply conservation is pinned by tests, and `validatorEconomics`/`governance` are unimplemented. A silent genesis balance edit would be an unreviewed supply change and a false public claim. | `validatorEconomics`, `governance`, `independentSecurityReview` |
| L-11 | Low | `docs/mainnet/*`, `deploy/ops/*` | No independent security review, no independent multi-host operating evidence, and no public disclosure record. | `independentSecurityReview`, `soloSoak` |

These map exactly to the ten false gates in `src/config/mainnet-readiness.ts`. The design drafts ([`SHIELDED_PAYMENTS_V3_DESIGN.md`](SHIELDED_PAYMENTS_V3_DESIGN.md), [`PQ_BACKEND_EVALUATION.md`](PQ_BACKEND_EVALUATION.md), [`DETERMINISTIC_CONSENSUS.md`](DETERMINISTIC_CONSENSUS.md)) are useful inputs, not completed constructions.

---

## 4. Areas reviewed and found adequately defended for a zero-value testnet

| Area | Evidence | Notes |
| --- | --- | --- |
| Wire framing | `src/network/wire.ts`, `src/tests/wire.test.ts` | Versioned binary envelope, network magic, 8 MiB frame cap, checksum, decode depth/array/key/string bounds, canonical signature hash. |
| Peer sessions | `src/network/auth-session.ts`, `src/tests/network-authentication.test.ts` | Mutual VERSION challenge, connection-bound session ID, ML-DSA signatures, strictly increasing per-direction sequences, timestamp freshness, handshake expiry. |
| Peer abuse | `src/network/peer-guard.ts`, `src/network/transport.ts`, `src/tests/transport-bounds.test.ts` | Per-host bans, 4 inbound per host, message window, 16 MiB/128-message queues, outbound buffered-byte cap, 4096 host entries with ban-preserving eviction. |
| Consensus determinism | `src/consensus/*`, `src/protocol/canonical.ts`, `src/tests/candidate-consensus.test.ts` | Exact proof thresholds, canonical fork ordering, restart revalidation, settlement-ID fix, network identity separation. |
| Storage | `src/storage/*`, `src/tests/persistence.test.ts` | Exclusive-create + fsync, checksum-linked journal, snapshot quarantine, incompatible-network rejection, torn-tail recovery. |
| Wallet | `src/wallet/*`, `src/tests/wallet*.test.ts` | No seed phrase handling in P2P; native BTC/ETH regtest round trips with pinned external binaries. Keystores remain local and git-ignored. |
| Website/API | `src/proxy.ts`, `worker/worker.js`, `worker/public-write.mjs`, `worker/rate-limit.mjs` | Fresh per-request nonce CSP, Turnstile server verification bound to action/hostname, 16 KiB body cap, fail-closed rate limiting and constant-time bearer comparison. Retired airdrop routes return 410. |
| Contracts | `contracts/*.sol`, `README.md` | Known-broken market/staking/dispenser sources are explicitly reference-only; faucet inactive until a reviewed minter is authorized by a clean owner. Original deployer wallet is compromised and blocked. |
| Supply chain | `.github/workflows/*` | Actions pinned by SHA, minimal `permissions`, release tags must be on `main`, release bundle excludes data/credentials/node_modules. |

## 5. Accepted residual risks (documented, not hidden)

- `worker/worker.js` returns a non-reflecting fallback `Access-Control-Allow-Origin` for unknown origins; browser same-origin policy still blocks reads. Acceptable because no cookies/credentials are used.
- `GET /api/health` performs an unauthenticated `SELECT 1` and reports only `connected`/`error`. Acceptable liveness probe.
- The website/API remain on Vercel, Cloudflare Workers and Turso. These are third parties but neither Fly.io nor Google Cloud, and are outside consensus trust.
- `JGCNode`'s in-memory `mainnetReadiness` override remains for tests (H-04 residual).
- Legacy `deploy/google`, `deploy/fly`, `deploy/monitor`, `src/ops/fly-cost-guard.ts` and `pilot-evidence.ts` still contain provider-specific code. They are archived and excluded from the active kit by `npm run infra:guard`.

## 6. Required before anyone calls this "secure"

1. External version-specific cryptographic review of the chosen proof system and shielded transaction construction.
2. External consensus/network/economics review with a public findings register and no unresolved high/critical findings.
3. Reproducible signed artifacts and two independent rebuilds.
4. Independent multi-host operation and real-cadence soak evidence.
5. A re-run of this review against the final release diff, recorded in [`RESECURE_REPORT.md`](RESECURE_REPORT.md).

Until then the correct label is: **hardened, fail-closed, zero-value testnet candidate**.
