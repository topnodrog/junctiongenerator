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
      if (path === "/api/referral" && request.method === "GET") {
        return await handleGetReferral(request, env, corsHeaders);
      }
      if (path === "/api/referral/claim" && request.method === "POST") {
        return await handleClaimReferral(request, env, corsHeaders);
      }
      if (path === "/api/ads/campaigns" && request.method === "GET") {
        return await handleGetCampaigns(request, env, corsHeaders);
      }
      if (path === "/api/ads/campaigns" && request.method === "POST") {
        return await handleCreateCampaign(request, env, corsHeaders);
      }
      if (path === "/api/airdrop/register" && request.method === "POST") {
        return await handleAirdropRegister(request, env, corsHeaders);
      }
      if (path === "/api/airdrop/status" && request.method === "GET") {
        return await handleAirdropStatus(request, env, corsHeaders);
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
  const tursoUrl = env.TURSO_URL || "https://jgt-mining-topnodrog.aws-us-east-2.turso.io";
  const args = params.map(toTursoValue);
  const res = await fetch(tursoUrl + "/v3/pipeline", {
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

// ============================================================
// REFERRAL SYSTEM
// ============================================================

// Generate a referral code from wallet address
function generateReferralCode(wallet) {
  // Simple hash: first 8 chars of base64-encoded address
  const hash = btoa(wallet.toLowerCase()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  return hash.toUpperCase();
}

// Get referral info for a user
async function handleGetReferral(request, env, corsHeaders) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet")?.toLowerCase();
  if (!wallet) {
    return jsonResponse({ error: "Wallet address required" }, corsHeaders, 400);
  }

  const referralCode = generateReferralCode(wallet);

  // Get referrer info
  const userResult = await tursoQuery(env, "SELECT referrer_code FROM users WHERE wallet_address = ?", [wallet]);
  const referrerCode = getRows(userResult)?.[0]?.[0];

  // Get referral count and earnings
  const refCountResult = await tursoQuery(env, "SELECT COUNT(*), COALESCE(SUM(referral_reward), 0) FROM users WHERE referrer_code = ?", [referralCode]);
  const refStats = getRows(refCountResult)?.[0];

  return jsonResponse({
    referralCode,
    referralUrl: `https://junctiongenerator.net?ref=${referralCode}`,
    referrerCode: referrerCode || null,
    referralsCount: parseInt(refStats?.[0]) || 0,
    referralEarnings: parseFloat(refStats?.[1]) || 0,
  }, corsHeaders);
}

// Claim a referral (called when a new user signs up with a referral code)
async function handleClaimReferral(request, env, corsHeaders) {
  const body = await request.json();
  const { walletAddress, referralCode } = body;

  if (!walletAddress || !referralCode) {
    return jsonResponse({ error: "Wallet address and referral code required" }, corsHeaders, 400);
  }

  const wallet = walletAddress.toLowerCase();
  const now = new Date().toISOString();

  // Check if user already has a referrer
  const existingResult = await tursoQuery(env, "SELECT referrer_code FROM users WHERE wallet_address = ?", [wallet]);
  if (getRows(existingResult)?.[0]?.[0]) {
    return jsonResponse({ error: "User already has a referrer" }, corsHeaders, 400);
  }

  // Check if referral code exists (is a valid user)
  const referrerResult = await tursoQuery(env, "SELECT wallet_address FROM users WHERE wallet_address = ?", [referralCode.toLowerCase()]);
  if (!getRows(referrerResult)?.[0]) {
    return jsonResponse({ error: "Invalid referral code" }, corsHeaders, 400);
  }

  // Can't refer yourself
  if (referralCode.toLowerCase() === wallet) {
    return jsonResponse({ error: "Cannot refer yourself" }, corsHeaders, 400);
  }

  // Update user with referrer
  await tursoQuery(env, "UPDATE users SET referrer_code = ? WHERE wallet_address = ?", [referralCode, wallet]);

  // Add referral reward to referrer (0.5 JGT bonus)
  const referralReward = 0.5;
  await tursoQuery(env, "INSERT INTO pending_claims (user_id, wallet_address, amount, status) SELECT id, wallet_address, ?, 'pending' FROM users WHERE wallet_address = ?", [referralReward, referralCode.toLowerCase()]);

  return jsonResponse({
    success: true,
    message: `Referral claimed! ${referralReward} JGT bonus added to referrer.`,
  }, corsHeaders);
}

// ============================================================
// AD CAMPAIGNS (Self-serve)
// ============================================================

async function handleGetCampaigns(request, env, corsHeaders) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "active";

  const result = await tursoQuery(env, `
    SELECT id, title, description, cta, cta_url, sponsor, image_url, budget, total_budget, impressions, clicks, status, created_at, wallet_address
    FROM ad_campaigns
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT 50
  `, [status]);

  const campaigns = (getRows(result) || []).map(row => ({
    id: row[0],
    title: row[1],
    description: row[2],
    cta: row[3],
    ctaUrl: row[4],
    sponsor: row[5],
    imageUrl: row[6],
    budget: parseFloat(row[7]) || 0,
    totalBudget: parseFloat(row[8]) || 0,
    impressions: parseInt(row[9]) || 0,
    clicks: parseInt(row[10]) || 0,
    status: row[11],
    createdAt: row[12],
    walletAddress: row[13],
  }));

  return jsonResponse({ campaigns }, corsHeaders);
}

async function handleCreateCampaign(request, env, corsHeaders) {
  const body = await request.json();
  const { title, description, cta, ctaUrl, sponsor, imageUrl, budget, dailyBudget, walletAddress } = body;

  if (!title || !description || !ctaUrl || !sponsor || !budget || !walletAddress) {
    return jsonResponse({ error: "Missing required fields" }, corsHeaders, 400);
  }

  const id = "camp-" + Date.now();
  const now = new Date().toISOString();

  await tursoQuery(env, `
    INSERT INTO ad_campaigns (id, title, description, cta, cta_url, sponsor, image_url, budget, total_budget, daily_budget, impressions, clicks, status, created_at, wallet_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'active', ?, ?)
  `, [id, title, description, cta, ctaUrl, sponsor, imageUrl || null, budget, budget, dailyBudget || null, now, walletAddress.toLowerCase()]);

  return jsonResponse({
    success: true,
    campaignId: id,
    message: "Campaign created successfully!",
  }, corsHeaders);
}

// ============================================================
// AIRDROP REGISTRATION
// ============================================================

async function handleAirdropRegister(request, env, corsHeaders) {
  const body = await request.json();
  const { walletAddress, email } = body;

  if (!walletAddress || !email) {
    return jsonResponse({ error: "Wallet address and email required" }, corsHeaders, 400);
  }

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return jsonResponse({ error: "Invalid email format" }, corsHeaders, 400);
  }

  // Validate wallet address (basic check)
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return jsonResponse({ error: "Invalid wallet address" }, corsHeaders, 400);
  }

  try {
    await tursoQuery(env, 
      "INSERT OR IGNORE INTO airdrop_registrations (wallet_address, email) VALUES (?, ?)",
      [walletAddress.toLowerCase(), email.toLowerCase()]
    );
    
    // Get registration count
    const countResult = await tursoQuery(env, "SELECT COUNT(*) FROM airdrop_registrations");
    const totalRegistered = getRows(countResult)?.[0]?.[0];

    return jsonResponse({
      success: true,
      message: "Registered for airdrop! You'll be notified when JGT is distributed.",
      totalRegistered: parseInt(totalRegistered) || 0,
    }, corsHeaders);
  } catch (err) {
    return jsonResponse({ error: "Registration failed" }, corsHeaders, 500);
  }
}

async function handleAirdropStatus(request, env, corsHeaders) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet")?.toLowerCase();
  
  if (!wallet) {
    return jsonResponse({ error: "Wallet address required" }, corsHeaders, 400);
  }

  const result = await tursoQuery(env, 
    "SELECT wallet_address, email, registered_at, notified, claimed FROM airdrop_registrations WHERE wallet_address = ?",
    [wallet]
  );
  const row = getRows(result)?.[0];

  if (!row) {
    return jsonResponse({ registered: false }, corsHeaders);
  }

  return jsonResponse({
    registered: true,
    walletAddress: row[0],
    email: row[1],
    registeredAt: row[2],
    notified: row[3] === "1",
    claimed: row[4] === "1",
  }, corsHeaders);
}
