// ═══════════════════════════════════════════
// SENDBLOC — Migration Runner
// Run: npm run migrate
// ═══════════════════════════════════════════

require("dotenv").config();
const db = require("../models/database");

console.log("[MIGRATE] Running database migrations...");
db.init();
console.log("[MIGRATE] Complete.\n");
db.close();
