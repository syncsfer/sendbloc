#!/usr/bin/env node

/**
 * Database seeder — creates demo wallets, contacts, and messages.
 * Usage: npm run seed
 */

require('dotenv').config();
const crypto = require('crypto');
const { getDb } = require('../models/database');
const { Users, Contacts, Messages, Groups, Settings } = require('../models');

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

  const db = getDb();
  const insertAll = db.transaction(() => {
    // 1. Create users (wallet = id, public_key is NOT NULL)
    for (const w of DEMO_WALLETS) {
      const publicKey = crypto.randomBytes(32).toString('hex');
      Users.create(w.wallet, publicKey, w.alias);
      console.log(`  Created user: ${w.alias} (${w.wallet})`);
    }

    // 2. Create contacts (Alice <-> Bob, Alice <-> Carol, Bob <-> Dave)
    const contactPairs = [
      [0, 1], [1, 0],
      [0, 2], [2, 0],
      [1, 3], [3, 1],
    ];
    for (const [a, b] of contactPairs) {
      Contacts.add(DEMO_WALLETS[a].wallet, DEMO_WALLETS[b].wallet, null);
    }
    console.log('  Created contact relationships');

    // 3. Create a group
    const groupId = `group_${crypto.randomUUID().slice(0, 8)}`;
    Groups.create(groupId, 'SendBloc Devs', DEMO_WALLETS[0].wallet, 'Core dev team');
    Groups.addMember(groupId, DEMO_WALLETS[0].wallet, 'admin');
    Groups.addMember(groupId, DEMO_WALLETS[1].wallet, 'member');
    Groups.addMember(groupId, DEMO_WALLETS[2].wallet, 'member');
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
      Messages.create({
        id: messageId,
        conversationId: convId,
        senderId: DEMO_WALLETS[msg.from].wallet,
        recipientId: DEMO_WALLETS[msg.to].wallet,
        type: 'text',
        content: msg.text,
        iv,
        authTag,
      });
    }
    console.log('  Created demo messages');

    // 5. Settings for all users
    for (const w of DEMO_WALLETS) {
      Settings.upsert(w.wallet, {
        notifications: true,
        sound: true,
        theme: 'light',
        readReceipts: true,
        biometricLock: false,
        network: 'ethereum',
      });
    }
    console.log('  Created user settings');
  });

  insertAll();
  console.log('\nSeed complete.');
}

// Run when called directly
seedDatabase();
