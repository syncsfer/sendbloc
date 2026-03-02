// ═══════════════════════════════════════════
// SENDBLOC — Data Models (Prepared Statements)
// ═══════════════════════════════════════════

const { init, getDb } = require("./database");

// Initialize database on first import (idempotent)
init();

/* ─────────────────────────────────────────
   USERS
   ───────────────────────────────────────── */
const Users = {
  create(wallet, publicKey, alias = null) {
    const db = getDb();
    return db.prepare(`
      INSERT INTO users (id, alias, public_key, avatar_gradient)
      VALUES (?, ?, ?, ?)
    `).run(wallet, alias, publicKey, wallet);
  },

  findById(wallet) {
    return getDb().prepare("SELECT * FROM users WHERE id = ?").get(wallet);
  },

  findByAlias(alias) {
    return getDb().prepare("SELECT * FROM users WHERE alias = ? COLLATE NOCASE").get(alias);
  },

  search(query, limit = 20) {
    return getDb().prepare(`
      SELECT id, alias, public_key, is_online, last_seen FROM users
      WHERE id LIKE ? OR alias LIKE ? COLLATE NOCASE
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, limit);
  },

  updateAlias(wallet, alias) {
    return getDb().prepare("UPDATE users SET alias = ?, updated_at = datetime('now') WHERE id = ?").run(alias, wallet);
  },

  updateOnlineStatus(wallet, isOnline) {
    return getDb().prepare(`
      UPDATE users SET is_online = ?, last_seen = datetime('now'), updated_at = datetime('now') WHERE id = ?
    `).run(isOnline ? 1 : 0, wallet);
  },

  updateNetwork(wallet, network) {
    return getDb().prepare("UPDATE users SET network = ?, updated_at = datetime('now') WHERE id = ?").run(network, wallet);
  },

  delete(wallet) {
    return getDb().prepare("DELETE FROM users WHERE id = ?").run(wallet);
  },
};

/* ─────────────────────────────────────────
   SESSIONS
   ───────────────────────────────────────── */
const Sessions = {
  create(id, userId, tokenHash, refreshHash, expiresAt, deviceInfo = null, ip = null) {
    return getDb().prepare(`
      INSERT INTO sessions (id, user_id, token_hash, refresh_hash, expires_at, device_info, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, tokenHash, refreshHash, expiresAt, deviceInfo, ip);
  },

  findByTokenHash(hash) {
    return getDb().prepare("SELECT * FROM sessions WHERE token_hash = ? AND is_revoked = 0").get(hash);
  },

  findByRefreshHash(hash) {
    return getDb().prepare("SELECT * FROM sessions WHERE refresh_hash = ? AND is_revoked = 0").get(hash);
  },

  revokeAll(userId) {
    return getDb().prepare("UPDATE sessions SET is_revoked = 1 WHERE user_id = ?").run(userId);
  },

  revoke(id) {
    return getDb().prepare("UPDATE sessions SET is_revoked = 1 WHERE id = ?").run(id);
  },

  cleanup() {
    return getDb().prepare("DELETE FROM sessions WHERE expires_at < datetime('now') OR is_revoked = 1").run();
  },
};

/* ─────────────────────────────────────────
   CONTACTS
   ───────────────────────────────────────── */
const Contacts = {
  add(userId, contactId, alias = null) {
    return getDb().prepare(`
      INSERT OR IGNORE INTO contacts (user_id, contact_id, alias) VALUES (?, ?, ?)
    `).run(userId, contactId, alias);
  },

  getAll(userId) {
    return getDb().prepare(`
      SELECT c.*, u.alias AS resolved_alias, u.is_online, u.last_seen, u.public_key
      FROM contacts c
      LEFT JOIN users u ON c.contact_id = u.id
      WHERE c.user_id = ?
      ORDER BY c.added_at DESC
    `).all(userId);
  },

  find(userId, contactId) {
    return getDb().prepare("SELECT * FROM contacts WHERE user_id = ? AND contact_id = ?").get(userId, contactId);
  },

  updateAlias(userId, contactId, alias) {
    return getDb().prepare("UPDATE contacts SET alias = ? WHERE user_id = ? AND contact_id = ?").run(alias, userId, contactId);
  },

  toggleBlock(userId, contactId) {
    return getDb().prepare(`
      UPDATE contacts SET is_blocked = CASE WHEN is_blocked = 0 THEN 1 ELSE 0 END
      WHERE user_id = ? AND contact_id = ?
    `).run(userId, contactId);
  },

  setBlocked(userId, contactId, blocked) {
    return getDb().prepare("UPDATE contacts SET is_blocked = ? WHERE user_id = ? AND contact_id = ?").run(blocked ? 1 : 0, userId, contactId);
  },

  toggleMute(userId, contactId) {
    return getDb().prepare(`
      UPDATE contacts SET is_muted = CASE WHEN is_muted = 0 THEN 1 ELSE 0 END
      WHERE user_id = ? AND contact_id = ?
    `).run(userId, contactId);
  },

  remove(userId, contactId) {
    return getDb().prepare("DELETE FROM contacts WHERE user_id = ? AND contact_id = ?").run(userId, contactId);
  },
};

/* ─────────────────────────────────────────
   MESSAGES
   ───────────────────────────────────────── */
const Messages = {
  create(msg) {
    return getDb().prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, recipient_id, type, content, iv, auth_tag,
        file_name, file_size, file_type, voice_duration, reply_to_id, reactions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msg.id, msg.conversationId, msg.senderId, msg.recipientId, msg.type || "text",
      msg.content, msg.iv, msg.authTag, msg.fileName, msg.fileSize, msg.fileType,
      msg.voiceDuration, msg.replyToId, JSON.stringify(msg.reactions || [])
    );
  },

  getByConversation(conversationId, limit = 50, offset = 0) {
    return getDb().prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ? AND is_deleted = 0
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `).all(conversationId, limit, offset);
  },

  getConversationPaginated(conversationId, beforeId = null, limit = 50) {
    if (beforeId) {
      return getDb().prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ? AND is_deleted = 0
          AND created_at < (SELECT created_at FROM messages WHERE id = ?)
        ORDER BY created_at DESC LIMIT ?
      `).all(conversationId, beforeId, limit).reverse();
    }
    return getDb().prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ? AND is_deleted = 0
      ORDER BY created_at DESC LIMIT ?
    `).all(conversationId, limit).reverse();
  },

  getById(id) {
    return getDb().prepare("SELECT * FROM messages WHERE id = ? AND is_deleted = 0").get(id);
  },

  markRead(conversationId, userId) {
    return getDb().prepare(`
      UPDATE messages SET is_read = 1
      WHERE conversation_id = ? AND sender_id != ? AND is_read = 0
    `).run(conversationId, userId);
  },

  markDelivered(messageIds) {
    const placeholders = messageIds.map(() => "?").join(",");
    return getDb().prepare(`
      UPDATE messages SET is_delivered = 1 WHERE id IN (${placeholders})
    `).run(...messageIds);
  },

  addReaction(messageId, emoji, userId) {
    const msg = getDb().prepare("SELECT reactions FROM messages WHERE id = ?").get(messageId);
    if (!msg) return null;
    const reactions = JSON.parse(msg.reactions || "[]");
    const existing = reactions.findIndex((r) => r.emoji === emoji && r.userId === userId);
    if (existing >= 0) reactions.splice(existing, 1);
    else reactions.push({ emoji, userId });
    return getDb().prepare("UPDATE messages SET reactions = ? WHERE id = ?").run(JSON.stringify(reactions), messageId);
  },

  softDelete(messageId, userId) {
    return getDb().prepare("UPDATE messages SET is_deleted = 1 WHERE id = ? AND sender_id = ?").run(messageId, userId);
  },

  getUnreadCount(userId) {
    return getDb().prepare(`
      SELECT conversation_id, COUNT(*) as count FROM messages
      WHERE recipient_id = ? AND is_read = 0 AND is_deleted = 0
      GROUP BY conversation_id
    `).all(userId);
  },

  getConversationsList(userId) {
    return getDb().prepare(`
      SELECT m.conversation_id, m.content, m.type, m.created_at, m.sender_id,
        m.file_name, m.voice_duration,
        (SELECT COUNT(*) FROM messages m2 WHERE m2.conversation_id = m.conversation_id
         AND m2.recipient_id = ? AND m2.is_read = 0 AND m2.is_deleted = 0) as unread_count
      FROM messages m
      INNER JOIN (
        SELECT conversation_id, MAX(created_at) as max_date
        FROM messages WHERE (sender_id = ? OR recipient_id = ?) AND is_deleted = 0
        GROUP BY conversation_id
      ) latest ON m.conversation_id = latest.conversation_id AND m.created_at = latest.max_date
      ORDER BY m.created_at DESC
    `).all(userId, userId, userId);
  },

  deleteConversation(conversationId, userId) {
    return getDb().prepare(`
      UPDATE messages SET is_deleted = 1
      WHERE conversation_id = ? AND (sender_id = ? OR recipient_id = ?)
    `).run(conversationId, userId, userId);
  },
};

/* ─────────────────────────────────────────
   GROUPS
   ───────────────────────────────────────── */
const Groups = {
  create(id, name, creatorId, description = null) {
    return getDb().prepare(`
      INSERT INTO groups_ (id, name, creator_id, description, avatar_seed)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, creatorId, description, id);
  },

  findById(id) {
    return getDb().prepare("SELECT * FROM groups_ WHERE id = ?").get(id);
  },

  update(id, fields) {
    const sets = [];
    const vals = [];
    if (fields.name !== undefined) { sets.push("name = ?"); vals.push(fields.name); }
    if (fields.description !== undefined) { sets.push("description = ?"); vals.push(fields.description); }
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    return getDb().prepare(`UPDATE groups_ SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  },

  delete(id) {
    return getDb().prepare("DELETE FROM groups_ WHERE id = ?").run(id);
  },

  getForUser(userId) {
    return getDb().prepare(`
      SELECT g.*, gm.role,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
      FROM groups_ g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ?
      ORDER BY g.updated_at DESC
    `).all(userId);
  },

  addMember(groupId, userId, role = "member") {
    return getDb().prepare(`
      INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)
    `).run(groupId, userId, role);
  },

  removeMember(groupId, userId) {
    return getDb().prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(groupId, userId);
  },

  getMembers(groupId) {
    return getDb().prepare(`
      SELECT gm.*, u.alias, u.is_online, u.last_seen, u.public_key
      FROM group_members gm
      LEFT JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
      ORDER BY gm.role DESC, gm.joined_at ASC
    `).all(groupId);
  },

  isMember(groupId, userId) {
    return !!getDb().prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, userId);
  },

  getMemberRole(groupId, userId) {
    const row = getDb().prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, userId);
    return row?.role;
  },
};

/* ─────────────────────────────────────────
   KEY EXCHANGE
   ───────────────────────────────────────── */
const KeyExchange = {
  create(senderId, recipientId, publicKey) {
    return getDb().prepare(`
      INSERT INTO key_exchanges (sender_id, recipient_id, public_key, expires_at)
      VALUES (?, ?, ?, datetime('now', '+1 hour'))
    `).run(senderId, recipientId, publicKey);
  },

  getPending(recipientId) {
    return getDb().prepare(`
      SELECT * FROM key_exchanges
      WHERE recipient_id = ? AND status = 'pending' AND expires_at > datetime('now')
      ORDER BY created_at DESC
    `).all(recipientId);
  },

  accept(id, recipientId) {
    return getDb().prepare(`
      UPDATE key_exchanges SET status = 'accepted' WHERE id = ? AND recipient_id = ?
    `).run(id, recipientId);
  },

  cleanup() {
    return getDb().prepare("DELETE FROM key_exchanges WHERE expires_at < datetime('now')").run();
  },
};

/* ─────────────────────────────────────────
   ADDRESS HISTORY
   ───────────────────────────────────────── */
const AddressHistory = {
  add(currentWallet, oldWallet, oldAlias) {
    return getDb().prepare(`
      INSERT INTO address_history (user_id, old_wallet, old_alias) VALUES (?, ?, ?)
    `).run(currentWallet, oldWallet, oldAlias);
  },

  getForUser(wallet, limit = 10) {
    return getDb().prepare(`
      SELECT * FROM address_history WHERE user_id = ? ORDER BY rotated_at DESC LIMIT ?
    `).all(wallet, limit);
  },
};

/* ─────────────────────────────────────────
   NOTIFICATIONS
   ───────────────────────────────────────── */
const Notifications = {
  create(id, userId, type, title, body, data = null) {
    return getDb().prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, type, title, body, data ? JSON.stringify(data) : null);
  },

  getForUser(userId, limit = 50) {
    return getDb().prepare(`
      SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(userId, limit);
  },

  markRead(id, userId) {
    return getDb().prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?").run(id, userId);
  },

  markAllRead(userId) {
    return getDb().prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(userId);
  },

  getUnreadCount(userId) {
    return getDb().prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0").get(userId);
  },
};

/* ─────────────────────────────────────────
   USER SETTINGS
   ───────────────────────────────────────── */
const Settings = {
  get(userId) {
    return getDb().prepare("SELECT * FROM user_settings WHERE user_id = ?").get(userId);
  },

  upsert(userId, settings) {
    return getDb().prepare(`
      INSERT INTO user_settings (user_id, notifications, read_receipts, biometric_lock, sound, theme, network, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        notifications = excluded.notifications,
        read_receipts = excluded.read_receipts,
        biometric_lock = excluded.biometric_lock,
        sound = excluded.sound,
        theme = excluded.theme,
        network = excluded.network,
        updated_at = datetime('now')
    `).run(
      userId,
      settings.notifications ? 1 : 0,
      settings.readReceipts ? 1 : 0,
      settings.biometricLock ? 1 : 0,
      settings.sound ? 1 : 0,
      settings.theme || "light",
      settings.network || "ethereum"
    );
  },
};

module.exports = {
  Users, Sessions, Contacts, Messages, Groups,
  KeyExchange, AddressHistory, Notifications, Settings,
};
