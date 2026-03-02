const Database = require('better-sqlite3');
const path = require('path');
const config = require('../config');

const dbPath = path.resolve(config.db.path);
const db = new Database(dbPath);

// Enable WAL mode for concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Migrations ──────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet        TEXT    NOT NULL UNIQUE,
    alias         TEXT,
    network       TEXT    DEFAULT 'ethereum',
    public_key    TEXT,
    avatar_url    TEXT,
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT    NOT NULL UNIQUE,
    refresh_hash    TEXT    NOT NULL UNIQUE,
    ip_address      TEXT,
    user_agent      TEXT,
    expires_at      TEXT    NOT NULL,
    created_at      TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alias         TEXT,
    blocked       INTEGER DEFAULT 0,
    muted         INTEGER DEFAULT 0,
    created_at    TEXT    DEFAULT (datetime('now')),
    UNIQUE(user_id, contact_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id   TEXT    NOT NULL,
    sender_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    group_id          INTEGER REFERENCES groups_(id) ON DELETE CASCADE,
    encrypted_content TEXT    NOT NULL,
    iv                TEXT    NOT NULL,
    auth_tag          TEXT    NOT NULL,
    message_type      TEXT    DEFAULT 'text',
    reactions         TEXT    DEFAULT '{}',
    read_by           TEXT    DEFAULT '[]',
    deleted           INTEGER DEFAULT 0,
    created_at        TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS groups_ (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    description   TEXT,
    avatar_url    TEXT,
    creator_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id    INTEGER NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT    DEFAULT 'member',
    joined_at   TEXT    DEFAULT (datetime('now')),
    UNIQUE(group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS key_exchanges (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key      TEXT    NOT NULL,
    status          TEXT    DEFAULT 'pending',
    created_at      TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS address_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet      TEXT    NOT NULL,
    rotated_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT    NOT NULL,
    title       TEXT    NOT NULL,
    body        TEXT,
    data        TEXT    DEFAULT '{}',
    read        INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id               INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    notifications_enabled INTEGER DEFAULT 1,
    sound_enabled         INTEGER DEFAULT 1,
    theme                 TEXT    DEFAULT 'system',
    language              TEXT    DEFAULT 'en',
    updated_at            TEXT    DEFAULT (datetime('now'))
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_messages_sender       ON messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_messages_recipient    ON messages(recipient_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_user         ON contacts(user_id);
  CREATE INDEX IF NOT EXISTS idx_group_members_group   ON group_members(group_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user         ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_wallet          ON users(wallet);
`);

module.exports = db;
