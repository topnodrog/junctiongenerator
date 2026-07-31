---
name: feedback-commit-as-you-go
description: "Commit completed work to git after each task, then continue — don't ask each time"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9c068aa4-5366-42b6-b8f5-01e71bf2c4a0
---

When doing multi-step work, prepare a git commit after each completed unit of work before moving on to the next task — without being asked each time.

**Why:** stated 2026-06-14 ("yes always prepare a git commit then continue"). Checkpoints matter given the BSOD history (see [[machine-bsod-constraint]]).

**How to apply:** after finishing and verifying a task, stage relevant source
files (exclude build artifacts/secrets), commit with a descriptive message,
push the current branch, and open or update the pull request without waiting for
a separate reminder. Stop only for failed verification, missing credentials,
ambiguous scope, or an unusually risky GitHub action.
