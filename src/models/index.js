const db = require('./database');

// ── Users ───────────────────────────────────────────────────────────────────

const users = {
  findByWallet: db.prepare('SELECT * FROM users WHERE wallet = ?'),
  findById: db.prepare('SELECT * FROM users WHERE id = ?'),
  create: db.prepare(
    'INSERT INTO users (wallet, alias, network, public_key) VALUES (?, ?, ?, ?)'
  ),
  update: db.prepare(
    'UPDATE users SET alias = ?, network = ?, avatar_url = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ),
  delete: db.prepare('DELETE FROM users WHERE id = ?'),
  search: db.prepare(
    'SELECT id, wallet, alias, avatar_url, network FROM users WHERE wallet LIKE ? OR alias LIKE ? LIMIT 20'
  ),
  getPublicProfile: db.prepare(
    'SELECT id, wallet, alias, avatar_url, network, created_at FROM users WHERE wallet = ?'
  ),
  rotateAddress: db.prepare('UPDATE users SET wallet = ?, updated_at = datetime(\'now\') WHERE id = ?'),
};

// ── Sessions ────────────────────────────────────────────────────────────────

const sessions = {
  create: db.prepare(
    'INSERT INTO sessions (user_id, token_hash, refresh_hash, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  findByTokenHash: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
  findByRefreshHash: db.prepare('SELECT * FROM sessions WHERE refresh_hash = ?'),
  deleteByTokenHash: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  deleteByUserId: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  deleteExpired: db.prepare('DELETE FROM sessions WHERE expires_at < datetime(\'now\')'),
};

// ── Contacts ────────────────────────────────────────────────────────────────

const contacts = {
  findByUser: db.prepare(`
    SELECT c.*, u.wallet, u.alias AS contact_alias, u.avatar_url, u.network
    FROM contacts c
    JOIN users u ON u.id = c.contact_id
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
  `),
  findById: db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?'),
  findByPair: db.prepare('SELECT * FROM contacts WHERE user_id = ? AND contact_id = ?'),
  create: db.prepare(
    'INSERT INTO contacts (user_id, contact_id, alias) VALUES (?, ?, ?)'
  ),
  updateAlias: db.prepare('UPDATE contacts SET alias = ? WHERE id = ? AND user_id = ?'),
  toggleBlock: db.prepare(
    'UPDATE contacts SET blocked = CASE WHEN blocked = 0 THEN 1 ELSE 0 END WHERE id = ? AND user_id = ?'
  ),
  toggleMute: db.prepare(
    'UPDATE contacts SET muted = CASE WHEN muted = 0 THEN 1 ELSE 0 END WHERE id = ? AND user_id = ?'
  ),
  delete: db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?'),
};

// ── Messages ────────────────────────────────────────────────────────────────

const messages = {
  getConversations: db.prepare(`
    SELECT m.conversation_id,
           m.encrypted_content, m.created_at AS last_message_at,
           CASE
             WHEN m.recipient_id = ? THEN m.sender_id
             ELSE m.recipient_id
           END AS other_user_id,
           m.group_id
    FROM messages m
    INNER JOIN (
      SELECT conversation_id, MAX(id) AS max_id
      FROM messages
      WHERE (sender_id = ? OR recipient_id = ?) AND deleted = 0
      GROUP BY conversation_id
    ) latest ON m.id = latest.max_id
    ORDER BY m.created_at DESC
  `),
  getByConversation: db.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ? AND deleted = 0
    ORDER BY created_at ASC
    LIMIT ? OFFSET ?
  `),
  getUnreadCount: db.prepare(`
    SELECT conversation_id, COUNT(*) AS count
    FROM messages
    WHERE recipient_id = ? AND deleted = 0
      AND NOT EXISTS (
        SELECT 1 WHERE json_extract(read_by, '$') LIKE '%' || ? || '%'
      )
    GROUP BY conversation_id
  `),
  findById: db.prepare('SELECT * FROM messages WHERE id = ?'),
  create: db.prepare(`
    INSERT INTO messages (conversation_id, sender_id, recipient_id, group_id, encrypted_content, iv, auth_tag, message_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  markRead: db.prepare('UPDATE messages SET read_by = ? WHERE id = ?'),
  updateReactions: db.prepare('UPDATE messages SET reactions = ? WHERE id = ?'),
  softDelete: db.prepare('UPDATE messages SET deleted = 1 WHERE id = ?'),
  deleteConversation: db.prepare(
    'UPDATE messages SET deleted = 1 WHERE conversation_id = ? AND (sender_id = ? OR recipient_id = ?)'
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
    'INSERT INTO groups_ (name, description, avatar_url, creator_id) VALUES (?, ?, ?, ?)'
  ),
  update: db.prepare(
    'UPDATE groups_ SET name = ?, description = ?, avatar_url = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ),
  delete: db.prepare('DELETE FROM groups_ WHERE id = ?'),
};

const groupMembers = {
  findByGroup: db.prepare(`
    SELECT gm.*, u.wallet, u.alias, u.avatar_url
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
    'SELECT ke.*, u.wallet AS sender_wallet FROM key_exchanges ke JOIN users u ON u.id = ke.sender_id WHERE ke.recipient_id = ? AND ke.status = \'pending\''
  ),
  findById: db.prepare('SELECT * FROM key_exchanges WHERE id = ?'),
  accept: db.prepare(
    'UPDATE key_exchanges SET status = \'accepted\' WHERE id = ?'
  ),
};

// ── Address History ─────────────────────────────────────────────────────────

const addressHistory = {
  create: db.prepare(
    'INSERT INTO address_history (user_id, wallet) VALUES (?, ?)'
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
    'INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)'
  ),
  markRead: db.prepare(
    'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?'
  ),
  markAllRead: db.prepare(
    'UPDATE notifications SET read = 1 WHERE user_id = ?'
  ),
};

// ── Settings ────────────────────────────────────────────────────────────────

const settings = {
  findByUser: db.prepare('SELECT * FROM user_settings WHERE user_id = ?'),
  upsert: db.prepare(`
    INSERT INTO user_settings (user_id, notifications_enabled, sound_enabled, theme, language, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id)
    DO UPDATE SET notifications_enabled = excluded.notifications_enabled,
                  sound_enabled = excluded.sound_enabled,
                  theme = excluded.theme,
                  language = excluded.language,
                  updated_at = datetime('now')
  `),
};

// ── Capitalized wrappers (function-style API for middleware) ─────────────────

const Sessions = {
  findByTokenHash(hash) { return sessions.findByTokenHash.get(hash); },
  findByRefreshHash(hash) { return sessions.findByRefreshHash.get(hash); },
  create(...args) { return sessions.create.run(...args); },
  deleteByTokenHash(hash) { return sessions.deleteByTokenHash.run(hash); },
  deleteByUserId(uid) { return sessions.deleteByUserId.run(uid); },
};

const Users = {
  findByWallet(wallet) { return users.findByWallet.get(wallet); },
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
