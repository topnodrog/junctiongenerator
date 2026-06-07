-- Turso Database Schema for JGT Attention Mining
-- Run these in the Turso CLI: turso db create jgt-mining

-- Users table: tracks wallet addresses and emails
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT UNIQUE NOT NULL,
    email TEXT,
    total_rewards_earned REAL DEFAULT 0,
    total_rewards_claimed REAL DEFAULT 0,
    session_count INTEGER DEFAULT 0,
    last_session_at TEXT,
    referrer_code TEXT,
    referral_reward REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Sessions table: tracks each mining session
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    wallet_address TEXT NOT NULL,
    ads_watched INTEGER DEFAULT 0,
    session_reward REAL DEFAULT 0,
    cooldown_ends_at TEXT,
    status TEXT DEFAULT 'active', -- active, completed, claimed
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Ad views table: individual ad watch events (for audit trail)
CREATE TABLE IF NOT EXISTS ad_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    ad_index INTEGER NOT NULL,
    reward_amount REAL NOT NULL,
    viewed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Pending claims table: rewards waiting for daily batch
CREATE TABLE IF NOT EXISTS pending_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    wallet_address TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    batch_id TEXT,
    tx_hash TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Batch history table: tracks daily dispense runs
CREATE TABLE IF NOT EXISTS dispense_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT UNIQUE NOT NULL,
    total_amount REAL NOT NULL,
    recipient_count INTEGER NOT NULL,
    tx_hash TEXT,
    status TEXT DEFAULT 'pending',
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
);

-- Newsletter subscribers
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    wallet_address TEXT,
    subscribed_at TEXT DEFAULT (datetime('now')),
    active INTEGER DEFAULT 1
);

-- Ad campaigns (self-serve)
CREATE TABLE IF NOT EXISTS ad_campaigns (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    cta TEXT DEFAULT 'Learn More',
    cta_url TEXT NOT NULL,
    sponsor TEXT NOT NULL,
    image_url TEXT,
    budget REAL NOT NULL,
    total_budget REAL NOT NULL,
    daily_budget REAL,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    wallet_address TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referrer_code);
CREATE INDEX IF NOT EXISTS idx_pending_claims_status ON pending_claims(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ad_views_session ON ad_views(session_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status);
