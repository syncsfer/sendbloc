// ═══════════════════════════════════════════
// SENDBLOC — API Test Suite
// Run: npm test (requires server running on :3001)
// ═══════════════════════════════════════════

const BASE = process.env.API_URL || "http://localhost:3001/api/v1";

let accessToken = null;
let refreshToken = null;
let testWallet = "0xde00000000000000000000000000000000000001";
let passed = 0;
let failed = 0;

async function request(method, path, body = null, auth = true) {
  const headers = { "Content-Type": "application/json" };
  if (auth && accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function assert(name, condition) {
  if (condition) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}`); }
}

async function run() {
  console.log("\n╔═══════════════════════════════════════╗");
  console.log("║   SendBloc API Test Suite             ║");
  console.log("╚═══════════════════════════════════════╝\n");

  // ─── Health ───
  console.log("▸ Health Check");
  const health = await request("GET", "/../health", null, false);
  assert("Health endpoint returns 200", health.status === 200);
  assert("Has service name", health.data?.service === "SendBloc API");

  // ─── API Info ───
  console.log("\n▸ API Info");
  const info = await request("GET", "", null, false);
  assert("API info returns 200", info.status === 200);
  assert("Has endpoints list", !!info.data?.endpoints);
  assert("Has WebSocket events", !!info.data?.websocket?.events);

  // ─── Auth ───
  console.log("\n▸ Authentication");
  const challenge = await request("POST", "/auth/challenge", { wallet: testWallet }, false);
  assert("Challenge returns 200", challenge.status === 200);
  assert("Has message to sign", !!challenge.data?.message);
  assert("Has nonce", !!challenge.data?.nonce);

  // Note: In real test, we'd sign with ethers.js wallet
  // For now, test auth failure
  const badVerify = await request("POST", "/auth/verify", {
    wallet: testWallet, signature: "0xbadsig", publicKey: "pk_test",
  }, false);
  assert("Bad signature rejected", badVerify.status === 401 || badVerify.status === 400);

  // ─── Networks ───
  console.log("\n▸ Networks");
  const networks = await request("GET", "/networks", null, false);
  assert("Networks returns 200", networks.status === 200);
  assert("Has 5 networks", networks.data?.length === 5);
  assert("Ethereum is first", networks.data?.[0]?.name === "Ethereum");

  const networkStatus = await request("GET", "/networks/status", null, false);
  assert("Network status returns 200", networkStatus.status === 200);
  assert("Has relay status", networkStatus.data?.[0]?.relayActive !== undefined);

  // ─── Protected routes without auth ───
  console.log("\n▸ Auth Protection");
  const noAuth = await request("GET", "/users/me", null, false);
  assert("Protected route rejects without token", noAuth.status === 401);

  const contacts = await request("GET", "/contacts", null, false);
  assert("Contacts reject without token", contacts.status === 401);

  // ─── 404 ───
  console.log("\n▸ Error Handling");
  const notFound = await request("GET", "/nonexistent", null, false);
  assert("Unknown route returns 404", notFound.status === 404);

  // ─── Summary ───
  console.log(`\n════════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`════════════════════════════════════════\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test suite failed:", err.message);
  process.exit(1);
});
