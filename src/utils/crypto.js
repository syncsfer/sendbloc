const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const config = require('../config');

// ── Wallet Signature Verification (EIP-191) ─────────────────────────────────

function generateChallenge(wallet) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return {
    nonce,
    timestamp,
    message: `SendBloc Authentication\n\nWallet: ${wallet}\nNonce: ${nonce}\nTimestamp: ${timestamp}`,
  };
}

function verifyChallenge(message, signature, wallet) {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== wallet.toLowerCase()) {
      return { valid: false, error: 'Signature does not match wallet' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid signature format' };
  }
}

function verifySignature(message, signature, expectedWallet) {
  const recovered = ethers.verifyMessage(message, signature);
  return recovered.toLowerCase() === expectedWallet.toLowerCase();
}

// ── JWT ─────────────────────────────────────────────────────────────────────

function signAccessToken(payload) {
  return jwt.sign({ ...payload, type: 'access' }, config.jwt.secret, {
    expiresIn: config.jwt.expiry,
  });
}

function signRefreshToken(payload) {
  return jwt.sign({ ...payload, type: 'refresh' }, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiry,
  });
}

function issueTokens(wallet) {
  const accessToken = signAccessToken({ sub: wallet });
  const refreshToken = signRefreshToken({ sub: wallet });

  const decoded = jwt.verify(refreshToken, config.jwt.secret);
  const expiresAt = new Date(decoded.exp * 1000).toISOString();

  return {
    accessToken,
    refreshToken,
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    expiresAt,
  };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch {
    return null;
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(prefix = '') {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

function conversationId(a, b) {
  return [a, b].sort().join('-');
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
  verifyChallenge,
  verifySignature,
  signAccessToken,
  signRefreshToken,
  issueTokens,
  verifyToken,
  hashToken,
  generateId,
  conversationId,
  encrypt,
  decrypt,
  generateKeyPair,
  deriveSharedSecret,
};
