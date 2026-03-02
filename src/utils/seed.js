#!/usr/bin/env node

/**
 * Database seeder — creates demo wallets, contacts, and messages.
 * Usage: npm run seed
 */

require('dotenv').config();
const crypto = require('crypto');
const db = require('../models/database');
const { users, contacts, groups, groupMembers, settings } = require('../models');

const DEMO_WALLETS = [
  { wallet: '0xAlice000000000000000000000000000000000001', alias: 'Alice', network: 'ethereum' },
  { wallet: '0xBob00000000000000000000000000000000000002', alias: 'Bob', network: 'ethereum' },
  { wallet: '0xCarol000000000000000000000000000000000003', alias: 'Carol', network: 'polygon' },
  { wallet: '0xDave0000000000000000000000000000000000004', alias: 'Dave', network: 'arbitrum' },
  { wallet: '0xEve00000000000000000000000000000000000005', alias: 'Eve', network: 'ethereum' },
];

function generateConversationId(a, b) {
  return [a, b].sort((x, y) => x - y).join('-');
}

function seedDatabase() {
  console.log('Seeding database...\n');

  const insertAll = db.transaction(() => {
    // 1. Create users
    const userIds = [];
    for (const w of DEMO_WALLETS) {
      const result = users.create.run(w.wallet, w.alias, w.network, null);
      userIds.push(result.lastInsertRowid);
      console.log(`  Created user: ${w.alias} (${w.wallet})`);
    }

    // 2. Create contacts (Alice <-> Bob, Alice <-> Carol, Bob <-> Dave)
    const contactPairs = [
      [0, 1], [1, 0],
      [0, 2], [2, 0],
      [1, 3], [3, 1],
    ];
    for (const [a, b] of contactPairs) {
      contacts.create.run(userIds[a], userIds[b], null);
    }
    console.log('  Created contact relationships');

    // 3. Create a group
    const groupResult = groups.create.run('SendBloc Devs', 'Core dev team', null, userIds[0]);
    const groupId = groupResult.lastInsertRowid;
    groupMembers.add.run(groupId, userIds[0], 'admin');
    groupMembers.add.run(groupId, userIds[1], 'member');
    groupMembers.add.run(groupId, userIds[2], 'member');
    console.log('  Created group: SendBloc Devs');

    // 4. Create demo messages
    const demoMessages = [
      { from: 0, to: 1, text: 'Hey Bob, how is the wallet integration going?' },
      { from: 1, to: 0, text: 'Almost done! Testing the signature flow now.' },
      { from: 0, to: 2, text: 'Carol, welcome to SendBloc!' },
      { from: 2, to: 0, text: 'Thanks Alice! Loving the encryption.' },
    ];

    const insertMsg = db.prepare(`
      INSERT INTO messages (conversation_id, sender_id, recipient_id, group_id, encrypted_content, iv, auth_tag, message_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'text')
    `);

    for (const msg of demoMessages) {
      const convId = generateConversationId(userIds[msg.from], userIds[msg.to]);
      const iv = crypto.randomBytes(12).toString('hex');
      const authTag = crypto.randomBytes(16).toString('hex');
      // In demo mode we store plaintext — in production the client encrypts
      insertMsg.run(convId, userIds[msg.from], userIds[msg.to], null, msg.text, iv, authTag);
    }
    console.log('  Created demo messages');

    // 5. Settings for all users
    for (const uid of userIds) {
      settings.upsert.run(uid, 1, 1, 'system', 'en');
    }
    console.log('  Created user settings');
  });

  insertAll();
  console.log('\nSeed complete.');
}

// Run when called directly
seedDatabase();
