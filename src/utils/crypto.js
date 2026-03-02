const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const config = require('../config');

// ── Wallet Signature Verification (EIP-191) ─────────────────────────────────

function generateChallenge() {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return {
    nonce,
    timestamp,
    message: `SendBloc Authentication\n\nNonce: ${nonce}\nTimestamp: ${timestamp}`,
  };
}

function verifySignature(message, signature, expectedWallet) {
  const recovered = ethers.verifyMessage(message, signature);
  return recovered.toLowerCase() === expectedWallet.toLowerCase();
}

// ── JWT ─────────────────────────────────────────────────────────────────────

function signAccessToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiry,
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiry,
  });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── AES-256-GCM Encryption ─────────────────────────────────────────────────

function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), authTag };
}

function decrypt(encrypted, key, iv, authTag) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex'),
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ── X25519 ECDH Key Exchange ────────────────────────────────────────────────

function generateKeyPair() {
  const keyPair = crypto.generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return {
    publicKey: keyPair.publicKey.toString('hex'),
    privateKey: keyPair.privateKey.toString('hex'),
  };
}

function deriveSharedSecret(privateKeyHex, publicKeyHex) {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(privateKeyHex, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKey = crypto.createPublicKey({
    key: Buffer.from(publicKeyHex, 'hex'),
    format: 'der',
    type: 'spki',
  });
  return crypto.diffieHellman({ privateKey, publicKey }).toString('hex');
}

module.exports = {
  generateChallenge,
  verifySignature,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  hashToken,
  encrypt,
  decrypt,
  generateKeyPair,
  deriveSharedSecret,
};
