# `@jg/codegen`

This package is the bounded code-generation surface described in the mainnet plan. It accepts a typed contract schema, normalizes it, emits byte-for-byte deterministic Solidity, runs a small deterministic source scanner, and writes content hashes into a manifest.

The package intentionally does **not** accept free-form prompt text, execute a compiler, deploy a contract, or connect to a wallet. `manifest.compiler.status` remains `not-run` until a release job runs a pinned `solc` toolchain with its dependency lock. `manifest.deployment.allowed` is always `false`; compilation, tests, static analysis, and human approval are separate release gates.

The first bounded release supports only `erc20` and `multisig`. ERC-721, DAO, and privileged-owner variants fail closed until they have independently reviewed templates and tests. The generated source carries the MIT SPDX identifier; it does not copy third-party source code.

From this directory:

```text
npm install
npm test
```
