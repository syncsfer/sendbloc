// ═══════════════════════════════════════════
// SENDBLOC — Database Layer (SQLite)
// ═══════════════════════════════════════════

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const config = require("../config");

let db = null;

/**
 * Initialize SQLite database with WAL mode and all tables
 */
function init() {
  if (db) return db;

  // Ensure data directory exists
  const dir = path.dirname(config.db.path);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(config.db.path);

  // Performance optimizations
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -64000"); // 64MB cache
  db.pragma("foreign_keys = ON");
  db.pragma("temp_store = MEMORY");

  migrate();

  console.log(`[DB] SQLite initialized at ${config.db.path}`);
  return db;
}

/**
 * Run all migrations
 */
function migrate() {
  db.exec(`
    -- ═══ USERS (Wallet Identities) ═══
    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY,                -- wallet address (0x...)
      alias           TEXT,                            -- optional ENS/alias
      public_key      TEXT NOT NULL,                   -- encryption public key
      encrypted_priv  TEXT,                            -- encrypted private key (client-encrypted)
      avatar_gradient TEXT,                            -- gradient seed
      network         TEXT DEFAULT 'ethereum',         -- active network
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now')),
      last_seen       TEXT DEFAULT (datetime('now')),
      is_online       INTEGER DEFAULT 0
    );

    -- ═══ SESSIONS (JWT tracking) ═══
    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash    TEXT NOT NULL,
      refresh_hash  TEXT,
      device_info   TEXT,
      ip_address    TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      expires_at    TEXT NOT NULL,
      is_revoked    INTEGER DEFAULT 0
    );

    -- ═══ CONTACTS ═══
    CREATE TABLE IF NOT EXISTS contacts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_id    TEXT NOT NULL,                     -- wallet address of contact
      alias         TEXT,                              -- user-set alias for contact
      is_blocked    INTEGER DEFAULT 0,
      is_muted      INTEGER DEFAULT 0,
      added_at      TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, contact_id)
    );

    -- ═══ MESSAGES ═══
    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,                   -- derived from sorted wallet pair or group id
      sender_id       TEXT NOT NULL,                   -- wallet address of sender
      recipient_id    TEXT,                            -- wallet address (null for groups)
      type            TEXT DEFAULT 'text',             -- text, file, voice, system
      content         TEXT,                            -- encrypted message content
      iv              TEXT,                            -- initialization vector
      auth_tag        TEXT,                            -- GCM auth tag
      file_name       TEXT,
      file_size       TEXT,
      file_type       TEXT,
      voice_duration  INTEGER,
      reply_to_id     TEXT,                            -- message ID being replied to
      reactions       TEXT DEFAULT '[]',               -- JSON array of {emoji, userId}
      is_read         INTEGER DEFAULT 0,
      is_delivered    INTEGER DEFAULT 0,
      is_deleted      INTEGER DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now')),
      edited_at       TEXT
    );

    -- ═══ GROUPS ═══
    CREATE TABLE IF NOT EXISTS groups_ (
      id            TEXT PRIMARY KEY,                  -- group_xxxxx
      name          TEXT NOT NULL,
      description   TEXT,
      creator_id    TEXT NOT NULL REFERENCES users(id),
      avatar_seed   TEXT,
      is_encrypted  INTEGER DEFAULT 1,
      max_members   INTEGER DEFAULT 256,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    -- ═══ GROUP MEMBERS ═══
    CREATE TABLE IF NOT EXISTS group_members (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id  TEXT NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
      user_id   TEXT NOT NULL,
      role      TEXT DEFAULT 'member',                -- admin, moderator, member
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(group_id, user_id)
    );

    -- ═══ KEY EXCHANGE ═══
    CREATE TABLE IF NOT EXISTS key_exchanges (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id     TEXT NOT NULL,
      recipient_id  TEXT NOT NULL,
      public_key    TEXT NOT NULL,                     -- ephemeral public key
      key_type      TEXT DEFAULT 'x25519',
      status        TEXT DEFAULT 'pending',            -- pending, accepted, expired
      created_at    TEXT DEFAULT (datetime('now')),
      expires_at    TEXT
    );

    -- ═══ ADDRESS HISTORY ═══
    CREATE TABLE IF NOT EXISTS address_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,                       -- current wallet
      old_wallet  TEXT NOT NULL,
      old_alias   TEXT,
      rotated_at  TEXT DEFAULT (datetime('now'))
    );

    -- ═══ NOTIFICATIONS ═══
    CREATE TABLE IF NOT EXISTS notifications (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,                       -- message, group_invite, key_exchange, system
      title       TEXT,
      body        TEXT,
      data        TEXT,                                -- JSON payload
      is_read     INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- ═══ USER SETTINGS ═══
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      notifications   INTEGER DEFAULT 1,
      read_receipts   INTEGER DEFAULT 1,
      biometric_lock  INTEGER DEFAULT 0,
      sound           INTEGER DEFAULT 1,
      theme           TEXT DEFAULT 'light',
      network         TEXT DEFAULT 'ethereum',
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    -- ═══ INDEXES ═══
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
    CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(recipient_id, is_read) WHERE is_read = 0;
    CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
    CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_key_exchanges_recipient ON key_exchanges(recipient_id, status);
    CREATE INDEX IF NOT EXISTS idx_address_history_user ON address_history(user_id);
  `);

  console.log("[DB] Migrations complete");
}

/**
 * Get database instance
 */
function getDb() {
  if (!db) throw new Error("Database not initialized — call init() first");
  return db;
}

/**
 * Close database gracefully
 */
function close() {
  if (db) {
    db.close();
    console.log("[DB] Connection closed");
  }
}

module.exports = { init, getDb, close, migrate };
