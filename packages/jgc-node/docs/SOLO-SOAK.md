# Solo multi-node soak

`solo-soak` exercises a local five-node WebSocket line using the real JGC node validation and synchronization paths. It mines on node A, verifies that the chain reaches every node, partitions the tail node, mines while it is offline, reconnects it, and verifies catch-up. No external participant, wallet, or public seed is required.

The default is 1,000 simnet blocks. Increase the run to the planned rehearsal ceiling with an explicit bound:

```text
npm run solo-soak -- --blocks 100000 --nodes 5 --output .tmp/solo-soak/100k.json
```

Use smaller runs while iterating:

```text
npm run solo-soak -- --blocks 20 --nodes 5
```

The evidence file is local, content-independent operational evidence. It does **not** prove production Groth16 keys, permissionless proposer enforcement, validator economics, a fork-choice specification, or an independent security review. The script always runs with the simnet verifier and zero-value transactions, and it never deploys or contacts a value-bearing network.
