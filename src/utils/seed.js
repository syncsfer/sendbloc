// ═══════════════════════════════════════════
// SENDBLOC — Database Seed Script
// Run: npm run seed
// ═══════════════════════════════════════════

require("dotenv").config();
const db = require("../models/database");
const { Users, Contacts, Messages, Groups, Settings } = require("../models");
const { generateId, conversationId } = require("../utils/crypto");

db.init();
const database = db.getDb();

console.log("[SEED] Clearing existing data...");
database.exec(`
  DELETE FROM messages;
  DELETE FROM group_members;
  DELETE FROM groups_;
  DELETE FROM contacts;
  DELETE FROM key_exchanges;
  DELETE FROM address_history;
  DELETE FROM notifications;
  DELETE FROM user_settings;
  DELETE FROM sessions;
  DELETE FROM users;
`);

console.log("[SEED] Creating users...");

const users = [
  { id: "0x7a3b9c4e1f2d8a6b5c0e3f7d9a1b4c6e8f0a2d4e", alias: "alice.eth", online: true },
  { id: "0x1d4e7a0b3c6f9e2d5a8b1c4e7f0a3d6b9c2e5f8a", alias: "bob.sol", online: true },
  { id: "0x9f2e5a8b1c4d7e0a3b6c9f2e5a8d1b4c7e0a3f6d", alias: null, online: false },
  { id: "0x3c6f9a2d5e8b1c4f7a0d3e6b9c2f5a8e1d4b7c0a", alias: "vitalik.eth", online: false },
  { id: "0x5a8b1c4e7d0a3f6c9e2b5a8d1c4f7e0a3b6d9c2e", alias: "satoshi.btc", online: false },
  { id: "0xdemo000000000000000000000000000000000001", alias: "demo.eth", online: true },
];

for (const u of users) {
  Users.create(u.id, `pk_${generateId()}`, u.alias);
  if (u.online) Users.updateOnlineStatus(u.id, true);
  Settings.upsert(u.id, { notifications: true, readReceipts: true, sound: true, theme: "light", network: "ethereum" });
}

console.log("[SEED] Creating contacts...");

const demoWallet = users[5].id;
for (const u of users.slice(0, 5)) {
  Contacts.add(demoWallet, u.id, u.alias);
  Contacts.add(u.id, demoWallet, "demo.eth");
}

console.log("[SEED] Creating messages...");

const aliceConv = conversationId(demoWallet, users[0].id);
const aliceMsgs = [
  { from: users[0].id, text: "Hey! Did you see the new governance proposal?", offset: -480 },
  { from: demoWallet, text: "Yes! The tokenomics look solid. Let's vote in favor.", offset: -360 },
  { from: users[0].id, text: "Agreed. Already staked my tokens for the vote.", offset: -300 },
  { from: demoWallet, text: "Perfect. Deploying the multisig now.", offset: -180 },
  { from: users[0].id, text: "The smart contract is deployed! 🚀", offset: -60 },
];

for (const m of aliceMsgs) {
  Messages.create({
    id: generateId("msg"),
    conversationId: aliceConv,
    senderId: m.from,
    recipientId: m.from === demoWallet ? users[0].id : demoWallet,
    type: "text",
    content: m.text,
    reactions: m.from === users[0].id && m.offset === -60 ? [{ emoji: "🔥", userId: demoWallet }] : [],
  });
}

const bobConv = conversationId(demoWallet, users[1].id);
const bobMsgs = [
  { from: users[1].id, text: "Tx confirmed on block #18,294,571", offset: -600 },
  { from: demoWallet, text: "Gas fees were reasonable today", offset: -480 },
  { from: users[1].id, text: "Check the transaction hash", offset: -300 },
];

for (const m of bobMsgs) {
  Messages.create({
    id: generateId("msg"),
    conversationId: bobConv,
    senderId: m.from,
    recipientId: m.from === demoWallet ? users[1].id : demoWallet,
    type: "text",
    content: m.text,
    reactions: [],
  });
}

console.log("[SEED] Creating group...");

const groupId = generateId("group");
Groups.create(groupId, "DeFi Devs", demoWallet, "Decentralized finance development team");
Groups.addMember(groupId, demoWallet, "admin");
Groups.addMember(groupId, users[0].id, "member");
Groups.addMember(groupId, users[1].id, "member");
Groups.addMember(groupId, users[3].id, "member");

Messages.create({
  id: generateId("msg"),
  conversationId: groupId,
  senderId: "system",
  type: "system",
  content: 'Group "DeFi Devs" created',
  reactions: [],
});

Messages.create({
  id: generateId("msg"),
  conversationId: groupId,
  senderId: users[0].id,
  type: "text",
  content: "Welcome to the DeFi Devs group! Let's build something amazing.",
  reactions: [],
});

Messages.create({
  id: generateId("msg"),
  conversationId: groupId,
  senderId: users[3].id,
  type: "text",
  content: "Excited to collaborate on the new AMM protocol!",
  reactions: [{ emoji: "🚀", userId: demoWallet }],
});

console.log("[SEED] Done! Seeded data:");
console.log(`  Users:    ${users.length}`);
console.log(`  Contacts: ${users.length - 1} (for demo wallet)`);
console.log(`  Messages: ${aliceMsgs.length + bobMsgs.length + 3}`);
console.log(`  Groups:   1`);
console.log(`\n  Demo wallet: ${demoWallet}`);
console.log(`  Demo alias:  demo.eth\n`);

db.close();
