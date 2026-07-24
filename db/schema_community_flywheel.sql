-- Apply to the existing Turso database before deploying the community Worker.
-- This migration is additive and does not modify legacy mining or newsletter data.

CREATE TABLE IF NOT EXISTS community_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    discord_name TEXT,
    audience_type TEXT NOT NULL DEFAULT 'curious',
    interests TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT 'direct',
    campaign TEXT NOT NULL DEFAULT 'community-launch',
    referral_code TEXT,
    consent_email INTEGER NOT NULL DEFAULT 0,
    consent_at TEXT,
    first_action TEXT,
    activated_at TEXT,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(member_id, action_type, note),
    FOREIGN KEY (member_id) REFERENCES community_members(id)
);

CREATE TABLE IF NOT EXISTS funding_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route TEXT NOT NULL,
    stage TEXT NOT NULL CHECK(stage IN ('pipeline', 'committed', 'received')),
    amount_usd REAL NOT NULL DEFAULT 0,
    source_label TEXT,
    next_follow_up TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weekly_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start TEXT UNIQUE NOT NULL,
    week_label TEXT NOT NULL,
    reach INTEGER NOT NULL DEFAULT 0,
    founder_hours REAL NOT NULL DEFAULT 0,
    growth_spend_usd REAL NOT NULL DEFAULT 0,
    experiment TEXT,
    current_needs TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_community_members_activated ON community_members(activated_at);
CREATE INDEX IF NOT EXISTS idx_community_members_source ON community_members(source, campaign);
CREATE INDEX IF NOT EXISTS idx_community_members_referral ON community_members(referral_code);
CREATE INDEX IF NOT EXISTS idx_community_actions_member ON community_actions(member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_funding_records_stage ON funding_records(stage);
