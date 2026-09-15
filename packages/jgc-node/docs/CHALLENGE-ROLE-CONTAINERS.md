# Testnet V1 challenge-role containers

The role stack packages the requester, miner, and verifier as isolated, one-shot containers. The three containers exchange versioned JSON artifacts through a dedicated volume. The miner and verifier have separate Ollama model volumes and independently run the frozen canonical CPU runtime.

## Run

From `packages/jgc-node`:

```sh
JGC_PROMPT="Name the capital of France in one word." docker compose -f compose.roles.yml up --build --abort-on-container-exit
docker compose -f compose.roles.yml cp verifier:/exchange/verdict.json ./verdict.json
docker compose -f compose.roles.yml down -v
```

On PowerShell, set `$env:JGC_PROMPT` before running the same `docker compose` command.

The first run pulls `gemma4:e2b` independently for the miner and verifier. The canonical runtime checks its digest, Ollama `0.34.0`, `Q4_K_M`, x64 CPU execution, seed `0`, temperature `0`, one CPU thread, and the 1,024-token ceiling before accepting work. Set `JGC_OLLAMA_PULL=0` after both persistent model volumes are populated to prohibit startup pulls.

Artifacts are written atomically as `/exchange/task.json`, `/exchange/claim.json`, and `/exchange/verdict.json`. A verifier profile mismatch produces `inconclusive` and never fraud evidence. A replayed commitment mismatch produces `fraud-evidence`; this V1 stack records evidence only and performs no reward or slashing action.

## Operational boundary

This stack is a single-host integration topology, not a trust boundary: the shared exchange volume replaces authenticated network transport. Production deployment must carry these same artifacts over the signed protocol messages and quorum rules frozen in `docs/TESTNET_V1_SPEC.md`.
