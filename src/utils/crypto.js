// ═══════════════════════════════════════════
// SENDBLOC — Crypto Utilities
// ═══════════════════════════════════════════

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { ethers } = require("ethers");
const config = require("../config");

/**
 * Generate a conversation ID from two wallet addresses
 * Deterministic: always produces the same ID regardless of order
 */
function conversationId(walletA, walletB) {
  const sorted = [walletA.toLowerCase(), walletB.toLowerCase()].sort();
  return crypto.createHash("sha256").update(sorted.join(":")).digest("hex").slice(0, 32);
}

/**
 * Generate a unique ID
 */
function generateId(prefix = "") {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Verify an Ethereum signature (EIP-191 personal_sign)
 * Returns the recovered wallet address or null
 */
function verifySignature(message, signature) {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered; // checksummed address
  } catch {
    return null;
  }
}

/**
 * Generate a challenge nonce for wallet authentication
 */
function generateChallenge(wallet) {
  const nonce = crypto.randomBytes(32).toString("hex");
  const timestamp = Date.now();
  const message = `SendBloc Authentication\n\nWallet: ${wallet}\nNonce: ${nonce}\nTimestamp: ${timestamp}\n\nSign this message to verify ownership of your wallet.`;
  return { nonce, timestamp, message };
}

/**
 * Verify a challenge was signed recently (within 5 minutes)
 */
function verifyChallenge(message, signature, expectedWallet) {
  const recovered = verifySignature(message, signature);
  if (!recovered) return { valid: false, error: "Invalid signature" };

  if (recovered.toLowerCase() !== expectedWallet.toLowerCase()) {
    return { valid: false, error: "Wallet mismatch" };
  }

  // Extract timestamp from message
  const match = message.match(/Timestamp: (\d+)/);
  if (match) {
    const ts = parseInt(match[1], 10);
    if (Date.now() - ts > 5 * 60 * 1000) {
      return { valid: false, error: "Challenge expired" };
    }
  }

  return { valid: true, wallet: recovered };
}

/**
 * Issue JWT access + refresh tokens
 */
function issueTokens(wallet) {
  const payload = { sub: wallet.toLowerCase(), iat: Math.floor(Date.now() / 1000) };

  const accessToken = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiry });
  const refreshToken = jwt.sign({ ...payload, type: "refresh" }, config.jwt.secret, { expiresIn: config.jwt.refreshExpiry });

  return {
    accessToken,
    refreshToken,
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + parseDuration(config.jwt.expiry)).toISOString(),
  };
}

/**
 * Verify a JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch {
    return null;
  }
}

/**
 * Hash a token for storage (don't store raw tokens)
 */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * AES-256-GCM encryption for server-side operations
 */
function encrypt(plaintext, keyBuffer) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { encrypted, iv: iv.toString("hex"), authTag };
}

/**
 * AES-256-GCM decryption
 */
function decrypt(encrypted, iv, authTag, keyBuffer) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Generate an encryption keypair (X25519 for ECDH)
 */
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

/**
 * Derive shared secret from ECDH
 */
function deriveSharedSecret(privateKeyPem, publicKeyPem) {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const publicKey = crypto.createPublicKey(publicKeyPem);
  return crypto.diffieHellman({ privateKey, publicKey });
}

/**
 * Parse duration string (e.g. "7d", "24h", "30m") to milliseconds
 */
function parseDuration(str) {
  const match = str.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * (multipliers[unit] || 86400000);
}

module.exports = {
  conversationId, generateId, verifySignature, generateChallenge,
  verifyChallenge, issueTokens, verifyToken, hashToken,
  encrypt, decrypt, generateKeyPair, deriveSharedSecret, parseDuration,
};
