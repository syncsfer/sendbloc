#!/usr/bin/env node

/**
 * Database seeder — creates demo wallets, contacts, and messages.
 * Usage: npm run seed
 */

require('dotenv').config();
const crypto = require('crypto');
const { db, users, contacts, messages, groups, groupMembers, settings } = require('../models');

const DEMO_WALLETS = [
  { wallet: '0xalice000000000000000000000000000000000001', alias: 'Alice', network: 'ethereum' },
  { wallet: '0xbob00000000000000000000000000000000000002', alias: 'Bob', network: 'ethereum' },
  { wallet: '0xcarol000000000000000000000000000000000003', alias: 'Carol', network: 'polygon' },
  { wallet: '0xdave0000000000000000000000000000000000004', alias: 'Dave', network: 'arbitrum' },
  { wallet: '0xeve00000000000000000000000000000000000005', alias: 'Eve', network: 'ethereum' },
];

function generateConversationId(a, b) {
  return [a, b].sort().join('-');
}

function seedDatabase() {
  console.log('Seeding database...\n');

  const insertAll = db.transaction(() => {
    // 1. Create users (wallet = id, public_key is NOT NULL)
    for (const w of DEMO_WALLETS) {
      const publicKey = crypto.randomBytes(32).toString('hex');
      users.create.run(w.wallet, w.alias, publicKey, null, null, w.network);
      console.log(`  Created user: ${w.alias} (${w.wallet})`);
    }

    // 2. Create contacts (Alice <-> Bob, Alice <-> Carol, Bob <-> Dave)
    const contactPairs = [
      [0, 1], [1, 0],
      [0, 2], [2, 0],
      [1, 3], [3, 1],
    ];
    for (const [a, b] of contactPairs) {
      contacts.create.run(DEMO_WALLETS[a].wallet, DEMO_WALLETS[b].wallet, null);
    }
    console.log('  Created contact relationships');

    // 3. Create a group
    const groupId = `group_${crypto.randomUUID().slice(0, 8)}`;
    groups.create.run(groupId, 'SendBloc Devs', 'Core dev team', DEMO_WALLETS[0].wallet, null);
    groupMembers.add.run(groupId, DEMO_WALLETS[0].wallet, 'admin');
    groupMembers.add.run(groupId, DEMO_WALLETS[1].wallet, 'member');
    groupMembers.add.run(groupId, DEMO_WALLETS[2].wallet, 'member');
    console.log('  Created group: SendBloc Devs');

    // 4. Create demo messages
    const demoMessages = [
      { from: 0, to: 1, text: 'Hey Bob, how is the wallet integration going?' },
      { from: 1, to: 0, text: 'Almost done! Testing the signature flow now.' },
      { from: 0, to: 2, text: 'Carol, welcome to SendBloc!' },
      { from: 2, to: 0, text: 'Thanks Alice! Loving the encryption.' },
    ];

    for (const msg of demoMessages) {
      const convId = generateConversationId(DEMO_WALLETS[msg.from].wallet, DEMO_WALLETS[msg.to].wallet);
      const iv = crypto.randomBytes(12).toString('hex');
      const authTag = crypto.randomBytes(16).toString('hex');
      const messageId = crypto.randomUUID();
      messages.create.run(
        messageId,
        convId,
        DEMO_WALLETS[msg.from].wallet,
        DEMO_WALLETS[msg.to].wallet,
        'text',
        msg.text,
        iv,
        authTag
      );
    }
    console.log('  Created demo messages');

    // 5. Settings for all users
    for (const w of DEMO_WALLETS) {
      settings.upsert.run(w.wallet, 1, 1, 'light', 1, 0, 'ethereum');
    }
    console.log('  Created user settings');
  });

  insertAll();
  console.log('\nSeed complete.');
}

// Run when called directly
seedDatabase();
