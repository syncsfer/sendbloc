const database = require('./database');
const db = database.init();

// ── Users (wallet = id) ─────────────────────────────────────────────────────

const findUserById = db.prepare('SELECT * FROM users WHERE id = ?');

const users = {
  findById: findUserById,
  findByWallet: findUserById, // alias — wallet IS the id
  create: db.prepare(
    'INSERT INTO users (id, alias, public_key, encrypted_priv, avatar_gradient, network) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  update: db.prepare(
    "UPDATE users SET alias = ?, network = ?, avatar_gradient = ?, updated_at = datetime('now') WHERE id = ?"
  ),
  delete: db.prepare('DELETE FROM users WHERE id = ?'),
  search: db.prepare(
    'SELECT id, alias, avatar_gradient, network FROM users WHERE id LIKE ? OR alias LIKE ? LIMIT 20'
  ),
  getPublicProfile: db.prepare(
    'SELECT id, alias, avatar_gradient, network, created_at FROM users WHERE id = ?'
  ),
  updateLastSeen: db.prepare(
    "UPDATE users SET last_seen = datetime('now'), is_online = ? WHERE id = ?"
  ),
};

// ── Sessions ────────────────────────────────────────────────────────────────

const sessions = {
  create: db.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, refresh_hash, device_info, ip_address, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ),
  findByTokenHash: db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND is_revoked = 0'),
  findByRefreshHash: db.prepare('SELECT * FROM sessions WHERE refresh_hash = ? AND is_revoked = 0'),
  revoke: db.prepare('UPDATE sessions SET is_revoked = 1 WHERE token_hash = ?'),
  revokeByUserId: db.prepare('UPDATE sessions SET is_revoked = 1 WHERE user_id = ?'),
  deleteExpired: db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
};

// ── Contacts ────────────────────────────────────────────────────────────────

const contacts = {
  findByUser: db.prepare(`
    SELECT c.*, u.alias AS contact_alias, u.avatar_gradient, u.network
    FROM contacts c
    LEFT JOIN users u ON u.id = c.contact_id
    WHERE c.user_id = ?
    ORDER BY c.added_at DESC
  `),
  findById: db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?'),
  findByPair: db.prepare('SELECT * FROM contacts WHERE user_id = ? AND contact_id = ?'),
  create: db.prepare(
    'INSERT INTO contacts (user_id, contact_id, alias) VALUES (?, ?, ?)'
  ),
  updateAlias: db.prepare('UPDATE contacts SET alias = ? WHERE id = ? AND user_id = ?'),
  toggleBlock: db.prepare(
    'UPDATE contacts SET is_blocked = CASE WHEN is_blocked = 0 THEN 1 ELSE 0 END WHERE id = ? AND user_id = ?'
  ),
  toggleMute: db.prepare(
    'UPDATE contacts SET is_muted = CASE WHEN is_muted = 0 THEN 1 ELSE 0 END WHERE id = ? AND user_id = ?'
  ),
  delete: db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?'),
};

// ── Messages ────────────────────────────────────────────────────────────────

const messages = {
  getConversations: db.prepare(`
    SELECT m.conversation_id,
           m.content, m.created_at AS last_message_at,
           CASE
             WHEN m.recipient_id = ? THEN m.sender_id
             ELSE m.recipient_id
           END AS other_user_id
    FROM messages m
    INNER JOIN (
      SELECT conversation_id, MAX(created_at) AS max_created
      FROM messages
      WHERE (sender_id = ? OR recipient_id = ?) AND is_deleted = 0
      GROUP BY conversation_id
    ) latest ON m.conversation_id = latest.conversation_id AND m.created_at = latest.max_created
    WHERE m.is_deleted = 0
    ORDER BY m.created_at DESC
  `),
  getByConversation: db.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ? AND is_deleted = 0
    ORDER BY created_at ASC
    LIMIT ? OFFSET ?
  `),
  getUnreadCount: db.prepare(`
    SELECT conversation_id, COUNT(*) AS count
    FROM messages
    WHERE recipient_id = ? AND is_deleted = 0 AND is_read = 0
    GROUP BY conversation_id
  `),
  findById: db.prepare('SELECT * FROM messages WHERE id = ?'),
  create: db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, recipient_id, type, content, iv, auth_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  markRead: db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?'),
  updateReactions: db.prepare('UPDATE messages SET reactions = ? WHERE id = ?'),
  softDelete: db.prepare('UPDATE messages SET is_deleted = 1 WHERE id = ?'),
  deleteConversation: db.prepare(
    'UPDATE messages SET is_deleted = 1 WHERE conversation_id = ? AND (sender_id = ? OR recipient_id = ?)'
  ),
};

// ── Groups ──────────────────────────────────────────────────────────────────

const groups = {
  findByUser: db.prepare(`
    SELECT g.*, gm.role
    FROM groups_ g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ?
    ORDER BY g.updated_at DESC
  `),
  findById: db.prepare('SELECT * FROM groups_ WHERE id = ?'),
  create: db.prepare(
    'INSERT INTO groups_ (id, name, description, creator_id, avatar_seed) VALUES (?, ?, ?, ?, ?)'
  ),
  update: db.prepare(
    "UPDATE groups_ SET name = ?, description = ?, avatar_seed = ?, updated_at = datetime('now') WHERE id = ?"
  ),
  delete: db.prepare('DELETE FROM groups_ WHERE id = ?'),
};

const groupMembers = {
  findByGroup: db.prepare(`
    SELECT gm.*, u.alias, u.avatar_gradient
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
  `),
  findMembership: db.prepare(
    'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?'
  ),
  add: db.prepare(
    'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
  ),
  remove: db.prepare(
    'DELETE FROM group_members WHERE group_id = ? AND user_id = ?'
  ),
  removeAll: db.prepare('DELETE FROM group_members WHERE group_id = ?'),
};

// ── Key Exchanges ───────────────────────────────────────────────────────────

const keyExchanges = {
  create: db.prepare(
    'INSERT INTO key_exchanges (sender_id, recipient_id, public_key) VALUES (?, ?, ?)'
  ),
  findPending: db.prepare(
    "SELECT * FROM key_exchanges WHERE recipient_id = ? AND status = 'pending'"
  ),
  findById: db.prepare('SELECT * FROM key_exchanges WHERE id = ?'),
  accept: db.prepare(
    "UPDATE key_exchanges SET status = 'accepted' WHERE id = ?"
  ),
};

// ── Address History ─────────────────────────────────────────────────────────

const addressHistory = {
  create: db.prepare(
    'INSERT INTO address_history (user_id, old_wallet, old_alias) VALUES (?, ?, ?)'
  ),
  findByUser: db.prepare(
    'SELECT * FROM address_history WHERE user_id = ? ORDER BY rotated_at DESC'
  ),
};

// ── Notifications ───────────────────────────────────────────────────────────

const notifications = {
  findByUser: db.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ),
  create: db.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  markRead: db.prepare(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?'
  ),
  markAllRead: db.prepare(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ?'
  ),
};

// ── Settings ────────────────────────────────────────────────────────────────

const settings = {
  findByUser: db.prepare('SELECT * FROM user_settings WHERE user_id = ?'),
  upsert: db.prepare(`
    INSERT INTO user_settings (user_id, notifications, sound, theme, read_receipts, biometric_lock, network, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id)
    DO UPDATE SET notifications = excluded.notifications,
                  sound = excluded.sound,
                  theme = excluded.theme,
                  read_receipts = excluded.read_receipts,
                  biometric_lock = excluded.biometric_lock,
                  network = excluded.network,
                  updated_at = datetime('now')
  `),
};

// ── Capitalized wrappers (function-style API for middleware) ─────────────────

const Sessions = {
  findByTokenHash(hash) { return sessions.findByTokenHash.get(hash); },
  findByRefreshHash(hash) { return sessions.findByRefreshHash.get(hash); },
  create(...args) { return sessions.create.run(...args); },
  revoke(tokenHash) { return sessions.revoke.run(tokenHash); },
  revokeByUserId(uid) { return sessions.revokeByUserId.run(uid); },
};

const Users = {
  findByWallet(wallet) { return users.findById.get(wallet); },
  findById(id) { return users.findById.get(id); },
};

module.exports = {
  db,
  users,
  sessions,
  contacts,
  messages,
  groups,
  groupMembers,
  keyExchanges,
  addressHistory,
  notifications,
  settings,
  Sessions,
  Users,
};
