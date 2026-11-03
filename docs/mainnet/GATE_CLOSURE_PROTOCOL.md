# Gate closure protocol

**Purpose:** turn "mainnet is blocked" into a finite, verifiable checklist that outside people can actually complete. Nothing in this document changes `packages/jgc-node/src/config/mainnet-readiness.ts`. A gate becomes `true` only after its signed evidence is accepted **and** the readiness record is updated in a reviewed release.

**Implementation:** `src/config/mainnet-launch-control.ts`, `src/crypto/proof-registry.ts`, `scripts/gate-status.mjs`, `scripts/mainnet-launch.mjs`, `scripts/proof-registry-check.mjs`, `scripts/sign-envelope.mjs`, `scripts/infra-guard.mjs`.

## 1. Why a protocol is needed

Before this pass the ten remaining gates were prose in `FINDINGS_AND_TODO.md`. Anyone could edit a boolean and claim readiness. Now there are four independent, machine-checked layers:

1. **Contract** — `GATE_EVIDENCE_REQUIREMENTS`: for each of the 12 gates, an owner, deliverable, exact artifact kinds, exact verification commands and whether an independent review is required.
2. **Evidence ledger** — one signed envelope per gate, bound to one 40-character release commit, with SHA-256 digests of every artifact and the CI run that produced it.
3. **Launch record** — an expiring, M-of-N signed record bound to the ledger digest, reviewed proof registry digest, release artifact digest, compiled chain identity/genesis and the readiness record.
4. **Policy** — a checked-in list of trusted Ed25519 public keys, a signature threshold (`>= 2`) and at least one independent reviewer signature. Empty by default: fail closed.

`npm run mainnet:launch` verifies all four, then calls `assertMainnetLaunchAllowed()`. It never starts a node.

## 2. Current machine-readable status

```text
cd packages/jgc-node
npm ci
npm run gates:status                  # all 12 gates, owners, deliverables, missing evidence
npm run proof:registry                # placeholder registry report
npm run mainnet:launch                # exits non-zero with the exact reasons
npm run infra:guard                   # no Fly.io / Google Cloud in the active kit
```

`deploy/selfhosted/launch-policy.json` has `trustedKeys: []`; `gate-evidence.json` has `records: []`; `proof-registry.json` is a placeholder; `mainnet-launch-record.json` does not exist. These are intentional.

## 3. Onboard a reviewer key (once per reviewer)

On an offline/operator-controlled machine:

```text
openssl genpkey -algorithm Ed25519 -out reviewer.key.pem
chmod 600 reviewer.key.pem
openssl pkey -in reviewer.key.pem -pubout -out reviewer.pub.pem
```

Compute the fingerprint exactly as the verifier does (after `npm run build`):

```text
cd packages/jgc-node
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {keyFingerprint} from './dist/config/mainnet-launch-control.js'; console.log(keyFingerprint(readFileSync('../../reviewer.pub.pem','utf8')));"
```

Add a PR containing **only** the public key and metadata (never the private key):

```json
{
  "keyId": "external-reviewer-01",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
  "fingerprint": "<sha256 of SPKI DER>",
  "role": "independent-reviewer",
  "organization": "Independent / verified out of band"
}
```

Rules: `keyId` matches `^[a-z0-9][a-z0-9._-]{2,63}$`; fingerprints are unique; at least one `independent-reviewer` exists; `threshold <= trustedKeys.length`; identity is verified out of band and recorded in the PR discussion. A reviewer must not be the project owner, an employee of the same organization as another signer, or the author of the code they are attesting.

## 4. Close one gate

### 4.1 Get the exact contract

```text
npm run gates:status | jq '.gates[] | select(.gate=="proofSystem")'
```

For `proofSystem` the required artifact kinds are `proof-registry`, `ceremony-transcript`, `verifier-binary`, `external-crypto-review` and the verification commands are `npm test -- --runTestsByPath src/tests/proof-registry.test.ts` and `npm run proof:registry -- --check`.

### 4.2 Produce the artifacts

Every artifact is a real file with a SHA-256 digest. Example payload (save as `proof-system-payload.json`):

```json
{
  "schemaVersion": 1,
  "kind": "jgc-gate-evidence",
  "gate": "proofSystem",
  "status": "satisfied",
  "releaseCommit": "<40-character lowercase commit hash>",
  "summary": "Ceremony-produced BN254 registry with two external crypto reviews and strict verifier tests",
  "artifacts": [
    { "kind": "proof-registry", "path": "artifacts/proof-registry.json", "sha256": "<64 hex>" },
    { "kind": "ceremony-transcript", "path": "artifacts/ceremony-transcript.txt", "sha256": "<64 hex>" },
    { "kind": "verifier-binary", "path": "artifacts/jgc_verifier.wasm", "sha256": "<64 hex>" },
    { "kind": "external-crypto-review", "path": "reviews/crypto-2027-01.pdf", "sha256": "<64 hex>" }
  ],
  "verificationCommands": [
    "npm test -- --runTestsByPath src/tests/proof-registry.test.ts",
    "npm run proof:registry -- --check"
  ],
  "ciRun": "https://github.com/topnodrog/junctiongenerator/actions/runs/<id>",
  "externalReview": {
    "reportSha256": "<64 hex>",
    "reviewerKeyIds": ["external-reviewer-01"],
    "findings": "none-high-or-critical"
  }
}
```

Rules enforced by `evaluateGateLedger()`:

- `artifacts[].kind` set must equal the requirement's set exactly (no extra/missing kinds).
- `verificationCommands` must equal the requirement's list exactly.
- All digests are lowercase 64-hex; every artifact has a non-empty path.
- `releaseCommit` is a full hash and must equal the ledger's commit and the launch record's commit.
- Independent-review gates need a valid `externalReview` whose `reviewerKeyIds` are trusted `independent-reviewer` keys, and at least one valid signature from an independent reviewer.
- The whole payload is signed over canonical sorted JSON; a single changed byte invalidates it.

### 4.3 Sign and add to the ledger

```text
cd packages/jgc-node
npm run sign:envelope -- \
  --payload ../../proof-system-payload.json \
  --key ../../reviewer.key.pem \
  --key-id external-reviewer-01 \
  --out ../../proof-system-envelope.json
```

Put the resulting `{ "payload": ..., "signatures": [...] }` object into `deploy/selfhosted/gate-evidence.json`'s `records` array. Repeat for all 12 gates. Re-run `npm run gates:status`; `evidenceSatisfied` must be `true` for every gate.

A second signer can add a signature with `--append true` (the payload must be canonically identical).

## 5. Proof registry gate (special case)

`deploy/selfhosted/proof-registry.json` must be a `ProofRegistryManifest`: full-length G1 (64-byte) and G2 (128-byte) hex points, `ic.length === numPublicInputs + 1`, unique circuit IDs, a ceremony with ≥2 participants and a transcript digest, and ≥2 external reviewer key IDs with `status: "no-unresolved-high-or-critical"`. It must match `MAINNET_NETWORK` (`jgc-mainnet-v3`, its consensus version and proof mode).

```text
npm run proof:registry -- --check     # exit 0 only when reviewed
```

The release binary must load this manifest instead of the built-in `CIRCUIT_REGISTRY`; that is checked as part of `reproducibleArtifacts` evidence.

## 6. Sign the launch record

First collect the values:

```text
cd packages/jgc-node
npm run gates:status | jq '.ledgerSha256, .proofRegistry.registrySha256'
node --input-type=module -e "const n=await import('./dist/config/networks.js'); console.log(JSON.stringify({chainId:n.MAINNET_NETWORK.chainId,consensusVersion:n.MAINNET_NETWORK.consensusVersion,proofMode:n.MAINNET_NETWORK.proofMode,genesisHash:n.networkGenesisHash(n.MAINNET_NETWORK)},null,2));"
sha256sum <release-archive.zip>       # artifactSha256
```

`mainnet-launch-record-payload.json`:

```json
{
  "schemaVersion": 1,
  "kind": "jgc-mainnet-launch-record",
  "network": { "chainId": "...", "consensusVersion": 0, "proofMode": "...", "genesisHash": "..." },
  "releaseCommit": "<40 hex>",
  "artifactSha256": "<64 hex>",
  "proofRegistrySha256": "<64 hex>",
  "ledgerSha256": "<64 hex>",
  "readiness": {
    "schemaVersion": 1,
    "status": "ready",
    "network": { "chainId": "...", "consensusVersion": 0, "proofMode": "..." },
    "gates": { "...all 12 keys...": true }
  },
  "issuedAt": "2027-..-..T..:..:..Z",
  "expiresAt": "2027-..-..T..:..:..Z",
  "activation": { "valueBearing": true, "earliestActivationHeight": 1 }
}
```

Sign with at least `threshold` distinct keys, including an independent reviewer:

```text
npm run sign:envelope -- --payload ../../mainnet-launch-record-payload.json \
  --key ../../release.key.pem --key-id release-signer-01 \
  --out ../../mainnet-launch-record.json
npm run sign:envelope -- --payload ../../mainnet-launch-record-payload.json \
  --key ../../reviewer.key.pem --key-id external-reviewer-01 \
  --out ../../mainnet-launch-record.json --append true
```

Copy the completed envelope to `deploy/selfhosted/mainnet-launch-record.json` only after the reviewed release is published. Then:

```text
npm run mainnet:launch
```

`ready: true` requires: valid policy, threshold signatures, ≥1 independent signer, unexpired record, exact compiled identity/genesis, ledger/registry/artifact digests, reviewed proof registry, all 12 gates evidence-satisfied, and `assertMainnetLaunchAllowed()` passing with `status: "ready"`.

**Even then this tool does not start a network.** Value-bearing activation requires the published runbook and a mainnet node launcher, neither of which exists today.

## 7. CI enforcement and anti-bypass rules

- `.github/workflows/infra-guard.yml` runs `infra-guard.mjs`, monitor tests, `proof-registry-check.mjs --assert-blocked`, `gate-status.mjs` and `mainnet-launch.mjs --assert-blocked` on every change to the kit, launch control or mainnet docs.
- `.github/workflows/jgc-node-ci.yml` still asserts the exact ten missing gates in `mainnet:preflight`.
- No gate may be closed by the person who implemented it alone.
- A consensus change invalidates all evidence for the affected gates: increment the consensus version, re-run the pinned vectors, create a new genesis if before activation, and re-sign.
- A key compromise removes the key from the policy and re-signs every affected record; old envelopes remain in Git history for audit.
- Gate evidence and reviewer reports are public. Private key material, wallet keystores and cloud credentials never enter the repository.
- If independent reviewers never materialize, the terminal safe state is a **zero-value canary**, not a value-bearing mainnet (see `docs/mainnet/README.md` solo policy).
