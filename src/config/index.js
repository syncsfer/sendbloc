// ═══════════════════════════════════════════
// SENDBLOC — Configuration
// ═══════════════════════════════════════════

const path = require("path");
require("dotenv").config();

const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  env: process.env.NODE_ENV || "development",
  apiVersion: process.env.API_VERSION || "v1",

  jwt: {
    secret: process.env.JWT_SECRET || "sendbloc-dev-secret-change-me",
    expiry: process.env.JWT_EXPIRY || "7d",
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || "30d",
  },

  db: {
    path: process.env.DB_PATH || path.join(__dirname, "../../data/sendbloc.db"),
  },

  cors: {
    origins: process.env.NODE_ENV === "production"
      ? true // Allow all origins in production (app serves its own frontend)
      : (process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:3001,http://localhost:5173")
          .split(",")
          .map((s) => s.trim()),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
  },

  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE_MB || "10", 10) * 1024 * 1024,
    dir: process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads"),
  },

  encryption: {
    algorithm: process.env.ENCRYPTION_ALGORITHM || "aes-256-gcm",
    keyDerivationRounds: parseInt(process.env.KEY_DERIVATION_ROUNDS || "100000", 10),
  },

  // Network configurations
  networks: [
    { id: "ethereum", name: "Ethereum", chainId: 1, color: "#627eea", rpcUrl: "https://mainnet.infura.io/v3/", active: true },
    { id: "base", name: "Base", chainId: 8453, color: "#0052ff", rpcUrl: "https://mainnet.base.org" },
    { id: "arbitrum", name: "Arbitrum", chainId: 42161, color: "#28a0f0", rpcUrl: "https://arb1.arbitrum.io/rpc" },
    { id: "polygon", name: "Polygon", chainId: 137, color: "#8247e5", rpcUrl: "https://polygon-rpc.com" },
    { id: "optimism", name: "Optimism", chainId: 10, color: "#ff0420", rpcUrl: "https://mainnet.optimism.io" },
  ],
};

module.exports = config;
