// Cloudflare Worker API for JGT Attention Mining
// Uses Turso HTTP API for database operations
// Deploy to: workers.cloudflare.com
// Required env vars: TURSO_URL, TURSO_AUTH_TOKEN, API_SECRET, CRON_SECRET

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === "/api/ad-view" && request.method === "POST") {
        return await handleAdView(request, env, corsHeaders);
      }
      if (path === "/api/user" && request.method === "GET") {
        return await handleGetUser(request, env, corsHeaders);
      }
      if (path === "/api/subscribe" && request.method === "POST") {
        return await handleSubscribe(request, env, corsHeaders);
      }
      if (path === "/api/pending-rewards" && request.method === "GET") {
        return await handlePendingRewards(request, env, corsHeaders);
      }
      if (path === "/api/dispense" && request.method === "POST") {
        return await handleDispense(request, env, corsHeaders);
      }
      if (path === "/api/health") {
        const dbResult = await tursoQuery(env, "SELECT 1");
        return jsonResponse({
          status: "ok",
          service: "JGT Mining API",
          database: dbResult ? "connected" : "error",
        }, corsHeaders);
      }
      return jsonResponse({ error: "Not found" }, corsHeaders, 404);
    } catch (err) {
      console.error("API Error:", err);
      return jsonResponse({ error: "Internal server error", message: err.message }, corsHeaders, 500);
    }
  },
};

// Convert a JS value to Turso v3 typed value
function toTursoValue(v) {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "number") {
    if (Number.isInteger(v)) return { type: "integer", value: String(v) };
    return { type: "float", value: String(v) };
  }
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  return { type: "text", value: String(v) };
}

// Execute SQL via Turso HTTP API
async function tursoQuery(env, sql, params = []) {
  const args = params.map(toTursoValue);
  const res = await fetch(env.TURSO_URL + "/v3/pipeline", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + env.TURSO_AUTH_TOKEN,
    },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql, args } },
        { type: "close" },
      ],
    }),
  });
  const data = await res.json();
  if (data.results && data.results[0] && data.results[0].response) {
    return data.results[0].response.result;
  }
  return null;
}

// Extract rows from Turso result (returns array of arrays of values)
function getRows(result) {
  if (!result || !result.rows) return [];
  return result.rows.map(row => row.map(cell => cell.value));
}

// Handle ad view registration
async function handleAdView(request, env, corsHeaders) {
  const body = await request.json();
  const { walletAddress, adIndex, rewardAmount, sessionId } = body;

  if (!walletAddress || adIndex === undefined || !rewardAmount) {
    return jsonResponse({ error: "Missing required fields" }, corsHeaders, 400);
  }

  const wallet = walletAddress.toLowerCase();
  const sid = sessionId || wallet + "-" + Date.now();
  const now = new Date().toISOString();

  // Upsert user
  await tursoQuery(env, "INSERT OR IGNORE INTO users (wallet_address, session_count, last_session_at) VALUES (?, 1, ?)", [wallet, now]);
  await tursoQuery(env, "UPDATE users SET session_count = session_count + 1, last_session_at = ? WHERE wallet_address = ?", [now, wallet]);

  // Get user ID
  const userResult = await tursoQuery(env, "SELECT id FROM users WHERE wallet_address = ?", [wallet]);
  const userId = getRows(userResult)?.[0]?.[0];
  if (!userId) {
    return jsonResponse({ error: "Failed to get/create user" }, corsHeaders, 500);
  }

  // Upsert session
  await tursoQuery(env, "INSERT OR IGNORE INTO sessions (user_id, wallet_address, ads_watched, session_reward, status) VALUES (?, ?, 1, ?, 'active')", [userId, wallet, rewardAmount]);
  await tursoQuery(env, "UPDATE sessions SET ads_watched = ads_watched + 1, session_reward = session_reward + ? WHERE user_id = ? AND status = 'active'", [rewardAmount, userId]);

  // Get session ID
  const sessionResult = await tursoQuery(env, "SELECT id FROM sessions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", [userId]);
  const sessionIdDb = getRows(sessionResult)?.[0]?.[0];

  // Record ad view
  await tursoQuery(env, "INSERT INTO ad_views (user_id, session_id, ad_index, reward_amount) VALUES (?, ?, ?, ?)", [userId, sessionIdDb, adIndex, rewardAmount]);

  // Add to pending claims
  await tursoQuery(env, "INSERT INTO pending_claims (user_id, wallet_address, amount, status) VALUES (?, ?, ?, 'pending')", [userId, wallet, rewardAmount]);

  // Update user totals
  await tursoQuery(env, "UPDATE users SET total_rewards_earned = total_rewards_earned + ?, updated_at = ? WHERE id = ?", [rewardAmount, now, userId]);

  return jsonResponse({
    success: true,
    wallet,
    rewardAmount,
    message: "Ad view recorded. Reward added to pending claims.",
  }, corsHeaders);
}

// Get user stats
async function handleGetUser(request, env, corsHeaders) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet")?.toLowerCase();

  if (!wallet) {
    return jsonResponse({ error: "Wallet address required" }, corsHeaders, 400);
  }

  const result = await tursoQuery(env, `
    SELECT u.wallet_address, u.total_rewards_earned, u.total_rewards_claimed, u.session_count, u.email, u.created_at, COALESCE(SUM(pc.amount), 0) as pending_rewards
    FROM users u
    LEFT JOIN pending_claims pc ON pc.user_id = u.id AND pc.status = 'pending'
    WHERE u.wallet_address = ?
    GROUP BY u.id
  `, [wallet]);

  const row = getRows(result)?.[0];
  if (!row) {
    return jsonResponse({ error: "User not found" }, corsHeaders, 404);
  }

  return jsonResponse({
    user: {
      wallet_address: row[0],
      total_rewards_earned: parseFloat(row[1]) || 0,
      total_rewards_claimed: parseFloat(row[2]) || 0,
      session_count: parseInt(row[3]) || 0,
      email: row[4],
      created_at: row[5],
      pending_rewards: parseFloat(row[6]) || 0,
    },
  }, corsHeaders);
}

// Newsletter subscription
async function handleSubscribe(request, env, corsHeaders) {
  const body = await request.json();
  const { email, walletAddress } = body;

  if (!email) {
    return jsonResponse({ error: "Email required" }, corsHeaders, 400);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return jsonResponse({ error: "Invalid email format" }, corsHeaders, 400);
  }

  try {
    await tursoQuery(env, "INSERT OR IGNORE INTO newsletter_subscribers (email, wallet_address) VALUES (?, ?)", [email.toLowerCase(), walletAddress?.toLowerCase() || null]);
    return jsonResponse({ success: true, message: "Subscribed to JGT newsletter!" }, corsHeaders);
  } catch (err) {
    return jsonResponse({ error: "Subscription failed" }, corsHeaders, 500);
  }
}

// Get pending rewards (admin)
async function handlePendingRewards(request, env, corsHeaders) {
  const pending = await tursoQuery(env, "SELECT wallet_address, SUM(amount) as total_pending, COUNT(*) as claim_count FROM pending_claims WHERE status = 'pending' GROUP BY wallet_address ORDER BY total_pending DESC");
  const summary = await tursoQuery(env, "SELECT COUNT(DISTINCT wallet_address) as unique_users, SUM(amount) as total_pending, COUNT(*) as total_claims FROM pending_claims WHERE status = 'pending'");

  return jsonResponse({
    summary: getRows(summary)?.[0],
    recipients: getRows(pending),
  }, corsHeaders);
}

// Daily dispense handler (called by cron)
async function handleDispense(request, env, corsHeaders) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== "Bearer " + env.CRON_SECRET) {
    return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
  }

  const pending = await tursoQuery(env, "SELECT wallet_address, SUM(amount) as total_amount, COUNT(*) as claim_count FROM pending_claims WHERE status = 'pending' GROUP BY wallet_address HAVING total_amount > 0");
  const recipients = getRows(pending);

  if (!recipients || recipients.length === 0) {
    return jsonResponse({ message: "No pending claims to process" }, corsHeaders);
  }

  const batchId = "batch-" + Date.now();
  const totalAmount = recipients.reduce((sum, r) => sum + parseFloat(r[1]), 0);

  await tursoQuery(env, "INSERT INTO dispense_batches (batch_id, total_amount, recipient_count, status) VALUES (?, ?, ?, 'processing')", [batchId, totalAmount, recipients.length]);
  await tursoQuery(env, "UPDATE pending_claims SET status = 'processing', batch_id = ? WHERE status = 'pending'", [batchId]);

  return jsonResponse({
    success: true,
    batchId,
    totalAmount,
    recipientCount: recipients.length,
    recipients,
    message: "Batch ready for on-chain submission",
  }, corsHeaders);
}

// Helper: JSON response
function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
