# Scripts Directory

Utility scripts organized by purpose.

## Structure

- **`deploy/`** — Smart contract deployment scripts for Base L2
  - `deploy.js` — Main contract deployment
  - `deploy_dispenser.js` — JGT Dispenser contract
  - `deploy_market.js` — JGT Market contract
  - `deploy_staking.js` — JGT Staking contract

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
