-- Airdrop registrations
CREATE TABLE IF NOT EXISTS airdrop_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    registered_at TEXT DEFAULT (datetime('now')),
    notified INTEGER DEFAULT 0,
    claimed INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_airdrop_wallet ON airdrop_registrations(wallet_address);
