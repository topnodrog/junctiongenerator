# Scripts Directory

Utility scripts organized by purpose.

> **Safety:** no deployment, transaction, database, or Cloudflare operation was
> run during the 2026-09-26 review. Treat operational scripts as privileged and
> review their effects before using them.

## Structure

- **`deploy/`** — Historical contract deployment scripts; not a general deploy tool
  - `deploy.js` — New JGT token deployment only; requires explicit
    `DEPLOY_JGT_TOKEN=1`, rejects the compromised original deployer, and checks
    for Base mainnet. Use only with separate approval.
  - `deploy_dispenser.js` — Retired `JGTBatchDispenser`; exits before loading keys.
  - `deploy_market.js` — Known unsafe legacy market; exits before loading keys.
  - `deploy_staking.js` — Known unsafe legacy staking contract; exits before loading keys.
  - `deployment-safety.js` — Shared compromised-sender guard.

- **`db/`** — Database and backend operations
  - `migrate_db.py` — Database schema migrations
  - `test_turso.py` — Turso database connection test
  - `verify_db.py` — Database verification utility
  - `check_deploy.py` — Check deployment status
  - `check_both.py` — Check both contract and database state
  - `deploy_worker.py` — Deploy Cloudflare Worker
  - `apply_airdrop_schema.py` — Apply airdrop schema
  - `push_page.py` — Push page data to database
  - `verify_users.py` — Verify user data integrity

- **`utils/`** — Utility scripts
  - `push_jg.sh` — Push commits to topnodrog/junctiongenerator repo

## 2BDeleted Directory

This directory is ignored and contains no tracked repository files as of
2026-09-05. Local copies may include separate tools and their dependencies;
they are preserved as owner data. It is not part of the public release or a
pending public-code deletion task. Use maintained scripts above rather than
assuming an older local filename is current.
