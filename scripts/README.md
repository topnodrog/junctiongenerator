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

Old iterative versions pending review for deletion:
- `apply_airdrop2.py` — Old version of apply_airdrop_schema.py
- `test_turso.py` — Old Turso test (v1, uses wrong endpoint)
- `test_turso2.py` — Old Turso test (v2, partial fix)
- `verify_db2.py` — Old version of verify_db.py

Keep this directory until confirming these old versions are no longer needed.
