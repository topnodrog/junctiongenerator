---
name: jgc-rust-build-env
description: "Historical build notes for the legacy JGC Groth16/WASM verifier; current PQ consensus does not require it"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c068aa4-5366-42b6-b8f5-01e71bf2c4a0
---

**Status update (2026-07-23):** these are historical build notes for the
legacy Groth16 verifier (`npm run build:rust` → wasm-pack) at
`packages/jgc-node/rust/`. Current consensus uses `src/crypto/pq-zkp.ts` via
the post-quantum facade and does not require this Rust/WASM build. Keep these
instructions only for legacy research or migration work.

**Toolchain (installed 2026-06-12):**
- Rust 1.96.0, default toolchain `stable-x86_64-pc-windows-gnu` (GNU, not MSVC — no VS Build Tools present), target `wasm32-unknown-unknown`
- `wasm-pack` 0.15.0 at `~/.cargo/bin/wasm-pack.exe` — prepend `$env:USERPROFILE\.cargo\bin` to PATH each shell

**THE REAL BLOCKER — Windows Smart App Control (SAC):**
`Get-MpComputerStatus` → `SmartAppControlState: On`. SAC blocks freshly-compiled unsigned executables (cargo build-script binaries like `zmij`):
`error: failed to run custom build command for 'zmij' ... An Application Control policy has blocked this file. (os error 4551)`
This is **path-independent** — blocks under any directory. The "OneDrive location" theory was wrong.

**Why builds sometimes succeed:** if cargo target dir holds previously-built artifacts, no fresh binary executes, so SAC doesn't fire. The cached target at `C:\Users\jgord\Documents\jg\_mono_rust_target` (from first successful build) still works via `CARGO_TARGET_DIR` — but FRAGILE: `cargo clean`, a dep bump, or toolchain update forces a fresh build and SAC blocks again.

**Durable fixes (not yet applied):**
- Turn SAC OFF — permanent (cannot re-enable without clean Windows reinstall). Needs admin + reboot.
- Build in Kali WSL2 — Linux build tooling not subject to Windows SAC. Best long-term.
- Stopgap: keep `CARGO_TARGET_DIR=C:\Users\jgord\Documents\jg\_mono_rust_target` and never `cargo clean`.

**How to apply:** set PATH for cargo/wasm-pack before building. To build today: `$env:CARGO_TARGET_DIR = "C:\Users\jgord\Documents\jg\_mono_rust_target"`. For robust fix, resolve SAC or use Kali.
