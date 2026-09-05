// Cloudflare Worker API for JGT Attention Mining
// Uses Turso HTTP API for database operations
// Deploy to: workers.cloudflare.com
// Required env vars: TURSO_URL, TURSO_AUTH_TOKEN, API_SECRET, CRON_SECRET
// Required bindings: EMAIL_SENDER (send_email binding, see wrangler.toml)
// Optional bindings: RATE_LIMITER (ratelimit binding, see wrangler.toml)
//
// Auth model:
//   - Public writes (rate-limited and Turnstile-verified): POST /api/subscribe, POST /api/hire-lead,
//     POST /api/community/join, POST /api/community/activate,
//   - Public reads: GET /api/user, GET /api/referral,
//     GET /api/community/scoreboard, GET /api/airdrop/status,
//     GET /api/ads/campaigns, GET /api/health
//   - Retired: POST /api/airdrop/register returns 410; no new reward enrollments.
//   - Bearer API_SECRET (owner): POST /api/ad-view, POST /api/referral/claim,
//     POST /api/ads/campaigns, POST /api/community/funding,
//     POST /api/community/weekly-metrics, GET /api/pending-rewards
//   - Bearer CRON_SECRET (automation): POST /api/dispense, POST /api/digest/run

import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";
import { PUBLIC_ACTIONS, readPublicJson, validateTurnstile } from "./public-write.mjs";

// ── Security helpers ─────────────────────────────────────────

// Origins allowed to call this API from a browser.
const ALLOWED_ORIGINS = new Set([
  "https://junctiongenerator.net",
  "https://www.junctiongenerator.net",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsHeadersFor(request) {
  const origin = request.headers.get("Origin") || "";
  const isVercelPreview = origin.startsWith("https://") && origin.endsWith(".vercel.app");
  const allowed = ALLOWED_ORIGINS.has(origin) || isVercelPreview
    ? origin
    : "https://junctiongenerator.net";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// Constant-time string comparison. Hashing both sides first equalizes
// length so the XOR loop leaks nothing about either value.
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// Bearer-token check. Fails closed when the secret is unset.
async function requireBearer(request, secret) {
  const header = request.headers.get("Authorization") || "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  return safeEqual(header.slice(7), secret);
}

// Per-IP rate limit via the ratelimit binding. Allows the request when the
// binding is not configured so local dev keeps working without it.
async function rateLimitOk(env, request, bucket) {
  if (!env.RATE_LIMITER) return true;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  try {
    const { success } = await env.RATE_LIMITER.limit({ key: bucket + ":" + ip });
    return success;
  } catch (err) {
    console.error("rate limiter error:", err);
    return true;
  }
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return null;
  const [user, domain] = email.split("@");
  return user.slice(0, 2) + "***@" + domain;
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

async function sendOwnerEmail(env, subject, body) {
  if (!env.EMAIL_SENDER) {
    console.error("owner notification skipped: EMAIL_SENDER binding missing");
    return false;
  }

  const recipient = env.DIGEST_RECIPIENT || "james_gordon@junctiongenerator.net";
  const msg = createMimeMessage();
  msg.setSender({ name: "Junction Generator", addr: "digest@junctiongenerator.net" });
  msg.setRecipient(recipient);
  msg.setSubject(subject);
  msg.addMessage({ contentType: "text/plain", data: body });

  const message = new EmailMessage("digest@junctiongenerator.net", recipient, msg.asRaw());
  await env.EMAIL_SENDER.send(message);
  console.log("owner notification sent");
  return true;
}

export default {
  async scheduled(event, env, ctx) {
    await sendDailyDigest(env);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = corsHeadersFor(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      let publicBody;
      const publicAction = PUBLIC_ACTIONS[path];
      if (request.method === "POST" && publicAction) {
        if (!(await rateLimitOk(env, request, publicAction))) {
          return jsonResponse({ error: "Too many requests" }, corsHeaders, 429);
        }
        const parsed = await readPublicJson(request);
        if (parsed.error) return jsonResponse({ error: parsed.error }, corsHeaders, parsed.status);
        const verified = await validateTurnstile(request, env, parsed.body, publicAction);
        if (verified.status !== 200) return jsonResponse({ error: verified.error }, corsHeaders, verified.status);
        publicBody = parsed.body;
      }
      // Legacy mining endpoint — owner-only. Rewards must never be creditable
      // by anonymous callers (pending_claims feeds the on-chain dispenser).
      if (path === "/api/ad-view" && request.method === "POST") {
        if (!(await requireBearer(request, env.API_SECRET))) {
          return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
        }
        return await handleAdView(request, env, corsHeaders);
      }
      if (path === "/api/user" && request.method === "GET") {
        return await handleGetUser(request, env, corsHeaders);
      }
      if (path === "/api/subscribe" && request.method === "POST") {
        return await handleSubscribe(publicBody, env, corsHeaders);
      }
      if (path === "/api/hire-lead" && request.method === "POST") {
        return await handleHireLead(publicBody, env, corsHeaders);
      }
      if (path === "/api/community/join" && request.method === "POST") {
        return await handleCommunityJoin(publicBody, env, corsHeaders);
      }
      if (path === "/api/community/activate" && request.method === "POST") {
        return await handleCommunityActivation(publicBody, env, corsHeaders);
      }
      if (path === "/api/community/scoreboard" && request.method === "GET") {
        return await handleCommunityScoreboard(env, corsHeaders);
      }
      if (path === "/api/community/funding" && request.method === "POST") {
        if (!(await requireBearer(request, env.API_SECRET))) {
          return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
        }
        return await handleFundingRecord(request, env, corsHeaders);
      }
      if (path === "/api/community/weekly-metrics" && request.method === "POST") {
        if (!(await requireBearer(request, env.API_SECRET))) {
          return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
        }
        return await handleWeeklyMetrics(request, env, corsHeaders);
      }
      if (path === "/api/referral" && request.method === "GET") {
        return await handleGetReferral(request, env, corsHeaders);
      }
      // Owner-only: credits referrer rewards, sybil-farmable if public.
      if (path === "/api/referral/claim" && request.method === "POST") {
        if (!(await requireBearer(request, env.API_SECRET))) {
          return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
        }
        return await handleClaimReferral(request, env, corsHeaders);
      }
      if (path === "/api/ads/campaigns" && request.method === "GET") {
        return await handleGetCampaigns(request, env, corsHeaders);
      }
      // Owner-only: campaign content is rendered on the site, so creation
      // must not be open to anonymous callers.
      if (path === "/api/ads/campaigns" && request.method === "POST") {
        if (!(await requireBearer(request, env.API_SECRET))) {
          return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
        }
        return await handleCreateCampaign(request, env, corsHeaders);
      }
      if (path === "/api/airdrop/register" && request.method === "POST") {
        return jsonResponse({ error: "Legacy JGT airdrop registration is retired." }, corsHeaders, 410);
      }
      if (path === "/api/airdrop/status" && request.method === "GET") {
        return await handleAirdropStatus(request, env, corsHeaders);
      }
      // Admin read: full wallet/amount ledger, owner-only.
      if (path === "/api/pending-rewards" && request.method === "GET") {
        if (!(await requireBearer(request, env.API_SECRET))) {
          return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
        }
        return await handlePendingRewards(request, env, corsHeaders);
      }
      if (path === "/api/dispense" && request.method === "POST") {
        return await handleDispense(request, env, corsHeaders);
      }
      if (path === "/api/digest/run" && request.method === "POST") {
        if (!(await requireBearer(request, env.CRON_SECRET))) {
          return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
        }
        await sendDailyDigest(env);
        return jsonResponse({ success: true, message: "Digest run triggered" }, corsHeaders);
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
      // Log full detail server-side; never echo err.message to clients
      // (Turso errors embed SQL and internal hostnames).
      console.error("API Error:", err);
      return jsonResponse({ error: "Internal server error" }, corsHeaders, 500);
    }
  },
};

// Convert a JS value to Turso v3 typed value
function toTursoValue(v) {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "number") {
    if (Number.isInteger(v)) return { type: "integer", value: String(v) };
    return { type: "float", value: v };
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
  if (!res.ok) {
    const errText = await res.text();
    console.error("Turso HTTP error:", res.status, errText);
    throw new Error("Turso error " + res.status + ": " + errText);
  }
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

// Handle ad view registration. The reward value is server-authoritative
// (AD_REWARD_JGT var, default 1 JGT) — a client-supplied rewardAmount is
// ignored, since pending_claims feeds the on-chain dispenser.
async function handleAdView(request, env, corsHeaders) {
  const body = await request.json();
  const { walletAddress, adIndex, campaignId } = body;

  if (!walletAddress || adIndex === undefined) {
    return jsonResponse({ error: "Missing required fields" }, corsHeaders, 400);
  }
  if (typeof walletAddress !== "string" || !WALLET_RE.test(walletAddress)) {
    return jsonResponse({ error: "Invalid wallet address" }, corsHeaders, 400);
  }
  if (!Number.isInteger(adIndex) || adIndex < 0 || adIndex > 9999) {
    return jsonResponse({ error: "Invalid ad index" }, corsHeaders, 400);
  }

  const rewardAmount = Number(env.AD_REWARD_JGT) > 0 ? Number(env.AD_REWARD_JGT) : 1;
  const wallet = walletAddress.toLowerCase();
  const now = new Date().toISOString();

  // Upsert user (insert at 0 so the increment lands new users on 1)
  await tursoQuery(env, "INSERT OR IGNORE INTO users (wallet_address, session_count, last_session_at) VALUES (?, 0, ?)", [wallet, now]);
  await tursoQuery(env, "UPDATE users SET session_count = session_count + 1, last_session_at = ? WHERE wallet_address = ?", [now, wallet]);

  // Get user ID
  const userResult = await tursoQuery(env, "SELECT id FROM users WHERE wallet_address = ?", [wallet]);
  const userId = getRows(userResult)?.[0]?.[0];
  if (!userId) {
    return jsonResponse({ error: "Failed to get/create user" }, corsHeaders, 500);
  }

  // Reuse the active session or open a new one. sessions has no unique
  // constraint, so INSERT OR IGNORE would silently insert a duplicate row
  // on every view (and the blanket UPDATE then double-counted the first ad).
  const activeResult = await tursoQuery(env, "SELECT id FROM sessions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", [userId]);
  let sessionIdDb = getRows(activeResult)?.[0]?.[0];
  if (sessionIdDb) {
    await tursoQuery(env, "UPDATE sessions SET ads_watched = ads_watched + 1, session_reward = session_reward + ? WHERE id = ?", [rewardAmount, sessionIdDb]);
  } else {
    await tursoQuery(env, "INSERT INTO sessions (user_id, wallet_address, ads_watched, session_reward, status) VALUES (?, ?, 1, ?, 'active')", [userId, wallet, rewardAmount]);
    const createdResult = await tursoQuery(env, "SELECT id FROM sessions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", [userId]);
    sessionIdDb = getRows(createdResult)?.[0]?.[0];
  }

  // Record ad view
  await tursoQuery(env, "INSERT INTO ad_views (user_id, session_id, ad_index, reward_amount) VALUES (?, ?, ?, ?)", [userId, sessionIdDb, adIndex, rewardAmount]);

  // Increment campaign impression count if campaignId provided
  if (campaignId) {
    await tursoQuery(env, "UPDATE ad_campaigns SET impressions = impressions + 1 WHERE id = ?", [String(campaignId).slice(0, 64)]);
  }

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

  // Never expose email here: this endpoint is public and keyed only by
  // wallet address, so returning it would let anyone deanonymize wallets.
  const result = await tursoQuery(env, `
    SELECT u.wallet_address, u.total_rewards_earned, u.total_rewards_claimed, u.session_count, u.created_at, COALESCE(SUM(pc.amount), 0) as pending_rewards
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
      created_at: row[4],
      pending_rewards: parseFloat(row[5]) || 0,
    },
  }, corsHeaders);
}

// Newsletter subscription
async function handleSubscribe(body, env, corsHeaders) {
  const { email, walletAddress } = body;

  if (!email || typeof email !== "string" || email.length > 254) {
    return jsonResponse({ error: "Email required" }, corsHeaders, 400);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return jsonResponse({ error: "Invalid email format" }, corsHeaders, 400);
  }

  const wallet = typeof walletAddress === "string" && WALLET_RE.test(walletAddress)
    ? walletAddress.toLowerCase()
    : null;

  try {
    await tursoQuery(env, "INSERT OR IGNORE INTO newsletter_subscribers (email, wallet_address) VALUES (?, ?)", [email.toLowerCase(), wallet]);
    try {
      await sendOwnerEmail(
        env,
        "New Junction Generator newsletter signup",
        [
          "A visitor joined the Junction Generator field notes.",
          "",
          `Email: ${email.toLowerCase()}`,
          wallet ? `Wallet: ${wallet}` : null,
          `Received: ${new Date().toISOString()}`,
        ].filter(Boolean).join("\n"),
      );
    } catch (notifyError) {
      // The database remains the source of truth. The midnight digest retries
      // visibility of this signup even if immediate email delivery fails.
      console.error("immediate newsletter notification failed:", notifyError.message);
    }
    return jsonResponse({ success: true, message: "Subscribed to JGT newsletter!" }, corsHeaders);
  } catch (err) {
    console.error("subscribe insert failed:", err.message);
    return jsonResponse({ error: "Subscription failed" }, corsHeaders, 500);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMMUNITY_ACTIONS = new Set(["introduction", "event", "technical", "share", "offer"]);
const AUDIENCE_TYPES = new Set(["ai-crypto-builder", "researcher", "operator", "community", "funder", "curious"]);
const COMMUNITY_INTERESTS = new Set(["builder", "researcher", "operator", "connector", "supporter"]);

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// Founding-community join. This also upserts the owned email list so a person
// has one coherent identity and can receive the weekly operating loop.
async function handleCommunityJoin(body, env, corsHeaders) {
  const email = cleanText(body.email, 254).toLowerCase();
  const discordName = cleanText(body.discordName, 80);
  const audienceType = AUDIENCE_TYPES.has(body.audienceType) ? body.audienceType : "curious";
  const interests = Array.isArray(body.interests)
    ? [...new Set(body.interests.filter((item) => COMMUNITY_INTERESTS.has(item)))].slice(0, 5)
    : [];
  const source = cleanText(body.source, 240) || "direct";
  const campaign = cleanText(body.campaign, 120) || "community-launch";
  const referralCode = cleanText(body.referralCode, 120);

  if (!EMAIL_RE.test(email)) return jsonResponse({ error: "A valid email is required" }, corsHeaders, 400);
  if (body.consent !== true) return jsonResponse({ error: "Email permission is required" }, corsHeaders, 400);
  if (interests.length === 0) return jsonResponse({ error: "Choose at least one community path" }, corsHeaders, 400);

  await tursoQuery(
    env,
    `INSERT INTO community_members
      (email, discord_name, audience_type, interests, source, campaign, referral_code, consent_email, consent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET
       discord_name = CASE WHEN excluded.discord_name != '' THEN excluded.discord_name ELSE community_members.discord_name END,
       audience_type = excluded.audience_type,
       interests = excluded.interests,
       source = CASE WHEN community_members.source IS NULL OR community_members.source = '' THEN excluded.source ELSE community_members.source END,
       campaign = CASE WHEN community_members.campaign IS NULL OR community_members.campaign = '' THEN excluded.campaign ELSE community_members.campaign END,
       referral_code = CASE WHEN community_members.referral_code IS NULL OR community_members.referral_code = '' THEN excluded.referral_code ELSE community_members.referral_code END,
       consent_email = 1,
       consent_at = datetime('now'),
       updated_at = datetime('now')`,
    [email, discordName, audienceType, JSON.stringify(interests), source, campaign, referralCode],
  );
  await tursoQuery(
    env,
    `INSERT INTO newsletter_subscribers (email, active) VALUES (?, 1)
     ON CONFLICT(email) DO UPDATE SET active = 1`,
    [email],
  );

  try {
    await sendOwnerEmail(env, "New JG founding-community member", [
      "A person joined the Junction Generator founding community.",
      "",
      `Email: ${email}`,
      discordName ? `Discord: ${discordName}` : null,
      `Audience: ${audienceType}`,
      `Interests: ${interests.join(", ")}`,
      `Source: ${source}`,
      `Campaign: ${campaign}`,
      referralCode ? `Referral: ${referralCode}` : null,
    ].filter(Boolean).join("\n"));
  } catch (error) {
    console.error("community join notification failed:", error.message);
  }

  return jsonResponse({
    success: true,
    message: "Choose and complete one meaningful action within seven days to become activated.",
  }, corsHeaders);
}

async function handleCommunityActivation(body, env, corsHeaders) {
  const email = cleanText(body.email, 254).toLowerCase();
  const action = cleanText(body.action, 40);
  const note = cleanText(body.note, 500);
  if (!EMAIL_RE.test(email) || !COMMUNITY_ACTIONS.has(action)) {
    return jsonResponse({ error: "Valid member email and action are required" }, corsHeaders, 400);
  }

  const memberResult = await tursoQuery(env, "SELECT id, activated_at FROM community_members WHERE email = ? LIMIT 1", [email]);
  const member = getRows(memberResult)?.[0];
  if (!member) return jsonResponse({ error: "Join the founding community before recording an action" }, corsHeaders, 404);

  await tursoQuery(
    env,
    "INSERT OR IGNORE INTO community_actions (member_id, action_type, note) VALUES (?, ?, ?)",
    [member[0], action, note],
  );
  if (!member[1]) {
    await tursoQuery(
      env,
      "UPDATE community_members SET activated_at = datetime('now'), first_action = ?, updated_at = datetime('now') WHERE id = ?",
      [action, member[0]],
    );
  }

  return jsonResponse({
    success: true,
    message: member[1] ? "Action recorded. Thank you for continuing to contribute." : "You are now an activated JG community member.",
  }, corsHeaders);
}

async function handleCommunityScoreboard(env, corsHeaders) {
  const totals = getRows(await tursoQuery(env, `
    SELECT
      COUNT(*),
      SUM(CASE WHEN activated_at IS NOT NULL THEN 1 ELSE 0 END),
      SUM(CASE WHEN activated_at IS NOT NULL AND referral_code IS NOT NULL AND referral_code != '' THEN 1 ELSE 0 END)
    FROM community_members
  `))?.[0] || [];
  const actionTotal = getRows(await tursoQuery(env, "SELECT COUNT(*) FROM community_actions"))?.[0]?.[0];
  const funding = getRows(await tursoQuery(env, `
    SELECT
      COALESCE(SUM(CASE WHEN stage = 'received' THEN amount_usd ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN stage = 'committed' THEN amount_usd ELSE 0 END), 0)
    FROM funding_records
  `))?.[0] || [];
  const weekly = getRows(await tursoQuery(env, `
    SELECT week_label, experiment, current_needs
    FROM weekly_metrics
    ORDER BY week_start DESC LIMIT 1
  `))?.[0] || [];

  return jsonResponse({
    weekLabel: weekly[0] || "Launch week",
    joins: parseInt(totals[0]) || 0,
    activated: parseInt(totals[1]) || 0,
    referralActivations: parseInt(totals[2]) || 0,
    contributions: parseInt(actionTotal) || 0,
    fundingReceived: parseFloat(funding[0]) || 0,
    fundingCommitted: parseFloat(funding[1]) || 0,
    experiments: weekly[1] ? [weekly[1]] : ["Founding-community onboarding"],
    currentNeeds: weekly[2] ? weekly[2].split("|").filter(Boolean) : ["Builders", "Researchers", "Operator candidates", "Connectors"],
  }, { ...corsHeaders, "Cache-Control": "public, max-age=300" });
}

async function handleFundingRecord(request, env, corsHeaders) {
  const body = await request.json();
  const route = cleanText(body.route, 60);
  const stage = cleanText(body.stage, 20);
  const amount = Number(body.amountUsd);
  if (!route || !["pipeline", "committed", "received"].includes(stage) || !Number.isFinite(amount) || amount < 0 || amount > 100000000) {
    return jsonResponse({ error: "Valid route, stage, and amountUsd are required" }, corsHeaders, 400);
  }
  await tursoQuery(
    env,
    "INSERT INTO funding_records (route, stage, amount_usd, source_label, next_follow_up) VALUES (?, ?, ?, ?, ?)",
    [route, stage, amount, cleanText(body.sourceLabel, 160), cleanText(body.nextFollowUp, 40) || null],
  );
  return jsonResponse({ success: true, message: "Funding record added" }, corsHeaders, 201);
}

async function handleWeeklyMetrics(request, env, corsHeaders) {
  const body = await request.json();
  const weekStart = cleanText(body.weekStart, 10);
  const weekLabel = cleanText(body.weekLabel, 80);
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(weekStart);
  if (!dateValid || !weekLabel) {
    return jsonResponse({ error: "weekStart (YYYY-MM-DD) and weekLabel are required" }, corsHeaders, 400);
  }
  const reach = Math.max(0, Math.min(1000000000, Math.trunc(Number(body.reach) || 0)));
  const founderHours = Math.max(0, Math.min(168, Number(body.founderHours) || 0));
  const growthSpend = Math.max(0, Math.min(100000000, Number(body.growthSpendUsd) || 0));
  const needs = Array.isArray(body.currentNeeds)
    ? body.currentNeeds.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 8).join("|")
    : "";
  await tursoQuery(
    env,
    `INSERT INTO weekly_metrics
      (week_start, week_label, reach, founder_hours, growth_spend_usd, experiment, current_needs)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(week_start) DO UPDATE SET
       week_label = excluded.week_label,
       reach = excluded.reach,
       founder_hours = excluded.founder_hours,
       growth_spend_usd = excluded.growth_spend_usd,
       experiment = excluded.experiment,
       current_needs = excluded.current_needs,
       updated_at = datetime('now')`,
    [weekStart, weekLabel, reach, founderHours, growthSpend, cleanText(body.experiment, 240), needs],
  );
  return jsonResponse({ success: true, message: "Weekly metrics updated" }, corsHeaders);
}

// "Hire me" lead capture (popup on the public site)
async function handleHireLead(body, env, corsHeaders) {
  const { email, phone, interest, message } = body;

  const emailVal = typeof email === "string" ? email.trim().toLowerCase().slice(0, 254) : "";
  const phoneVal = typeof phone === "string" ? phone.trim().slice(0, 40) : "";

  if (!emailVal && !phoneVal) {
    return jsonResponse({ error: "Email or phone required" }, corsHeaders, 400);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailVal && !emailRegex.test(emailVal)) {
    return jsonResponse({ error: "Invalid email format" }, corsHeaders, 400);
  }

  try {
    await tursoQuery(
      env,
      "INSERT INTO hire_leads (email, phone, interest, message) VALUES (?, ?, ?, ?)",
      [emailVal || null, phoneVal || null, typeof interest === "string" ? interest.slice(0, 200) : null, typeof message === "string" ? message.slice(0, 2000) : null]
    );
    try {
      await sendOwnerEmail(
        env,
        "New Junction Generator project inquiry",
        [
          "A visitor asked about hiring James through junctiongenerator.net.",
          "",
          emailVal ? `Email: ${emailVal}` : null,
          phoneVal ? `Phone: ${phoneVal}` : null,
          typeof interest === "string" && interest ? `Interest: ${interest.slice(0, 200)}` : null,
          typeof message === "string" && message ? `Message: ${message.slice(0, 2000)}` : null,
          `Received: ${new Date().toISOString()}`,
        ].filter(Boolean).join("\n"),
      );
    } catch (notifyError) {
      // Never discard a client lead because mail delivery is temporarily down.
      // The stored lead remains eligible for the midnight digest.
      console.error("immediate hire notification failed:", notifyError.message);
    }
    return jsonResponse({ success: true, message: "Thanks — I'll be in touch soon!" }, corsHeaders);
  } catch (err) {
    console.error("hire-lead insert failed:", err.message);
    return jsonResponse({ error: "Submission failed" }, corsHeaders, 500);
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
  if (!(await requireBearer(request, env.CRON_SECRET))) {
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

// ============================================================
// DAILY DIGEST (new signups since last run -> email to owner)
// ============================================================

async function sendDailyDigest(env) {
  // Self-heal: the UPDATEs below silently no-op if the row is missing
  // (e.g. fresh database where the migration hasn't run yet).
  await tursoQuery(env, "INSERT OR IGNORE INTO digest_state (id, last_sent_at) VALUES (1, '1970-01-01 00:00:00')");
  const stateResult = await tursoQuery(env, "SELECT last_sent_at FROM digest_state WHERE id = 1");
  const lastSentAt = getRows(stateResult)?.[0]?.[0] || "1970-01-01 00:00:00";
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  const newsletterResult = await tursoQuery(
    env,
    "SELECT email, wallet_address, subscribed_at FROM newsletter_subscribers WHERE subscribed_at > ? ORDER BY subscribed_at ASC",
    [lastSentAt]
  );
  const airdropResult = await tursoQuery(
    env,
    "SELECT email, wallet_address, registered_at FROM airdrop_registrations WHERE registered_at > ? ORDER BY registered_at ASC",
    [lastSentAt]
  );
  const hireLeadResult = await tursoQuery(
    env,
    "SELECT email, phone, interest, message, created_at FROM hire_leads WHERE created_at > ? ORDER BY created_at ASC",
    [lastSentAt]
  );

  const newsletterRows = getRows(newsletterResult);
  const airdropRows = getRows(airdropResult);
  const hireLeadRows = getRows(hireLeadResult);

  if (newsletterRows.length === 0 && airdropRows.length === 0 && hireLeadRows.length === 0) {
    await tursoQuery(env, "UPDATE digest_state SET last_sent_at = ? WHERE id = 1", [now]);
    return;
  }

  const lines = [];
  if (newsletterRows.length) {
    lines.push(`Newsletter signups (${newsletterRows.length}):`);
    newsletterRows.forEach(([email, wallet, ts]) => {
      lines.push(`  - ${email}${wallet ? " | wallet: " + wallet : ""} | ${ts}`);
    });
    lines.push("");
  }
  if (airdropRows.length) {
    lines.push(`Airdrop registrations (${airdropRows.length}):`);
    airdropRows.forEach(([email, wallet, ts]) => {
      lines.push(`  - ${email} | wallet: ${wallet} | ${ts}`);
    });
    lines.push("");
  }
  if (hireLeadRows.length) {
    lines.push(`Hire-me leads (${hireLeadRows.length}):`);
    hireLeadRows.forEach(([email, phone, interest, message, ts]) => {
      const contact = [email, phone].filter(Boolean).join(" | ");
      lines.push(`  - ${contact}${interest ? " | interest: " + interest : ""}${message ? " | msg: " + message : ""} | ${ts}`);
    });
  }

  await sendOwnerEmail(
    env,
    `JGC daily digest: ${newsletterRows.length + airdropRows.length + hireLeadRows.length} new signup(s)`,
    lines.join("\n"),
  );
  await tursoQuery(env, "UPDATE digest_state SET last_sent_at = ? WHERE id = 1", [now]);
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

// The referral code IS the referrer's wallet address (lowercased). Wallet
// addresses are already public identifiers, and using them directly keeps
// code generation, claim validation, and stats counting consistent — the old
// base64 scheme generated codes that claim lookups never matched, so
// referral counts were permanently zero.

// Get referral info for a user
async function handleGetReferral(request, env, corsHeaders) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet")?.toLowerCase();
  if (!wallet || !WALLET_RE.test(wallet)) {
    return jsonResponse({ error: "Valid wallet address required" }, corsHeaders, 400);
  }

  const referralCode = wallet;

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

// Claim a referral (owner-gated at the route: it credits real rewards from
// client-supplied wallets with no signature proof, so it must not be public).
async function handleClaimReferral(request, env, corsHeaders) {
  const body = await request.json();
  const { walletAddress, referralCode } = body;

  if (!walletAddress || !referralCode) {
    return jsonResponse({ error: "Wallet address and referral code required" }, corsHeaders, 400);
  }

  const wallet = String(walletAddress).toLowerCase();
  const referrer = String(referralCode).toLowerCase();

  if (!WALLET_RE.test(wallet) || !WALLET_RE.test(referrer)) {
    return jsonResponse({ error: "Invalid wallet address" }, corsHeaders, 400);
  }

  // Can't refer yourself
  if (referrer === wallet) {
    return jsonResponse({ error: "Cannot refer yourself" }, corsHeaders, 400);
  }

  // Check if user already has a referrer
  const existingResult = await tursoQuery(env, "SELECT referrer_code FROM users WHERE wallet_address = ?", [wallet]);
  if (getRows(existingResult)?.[0]?.[0]) {
    return jsonResponse({ error: "User already has a referrer" }, corsHeaders, 400);
  }

  // Check if referral code exists (is a valid user)
  const referrerResult = await tursoQuery(env, "SELECT wallet_address FROM users WHERE wallet_address = ?", [referrer]);
  if (!getRows(referrerResult)?.[0]) {
    return jsonResponse({ error: "Invalid referral code" }, corsHeaders, 400);
  }

  // Update user with referrer
  await tursoQuery(env, "UPDATE users SET referrer_code = ? WHERE wallet_address = ?", [referrer, wallet]);

  // Add referral reward to referrer (0.5 JGT bonus). referral_reward on the
  // users row backs the earnings stat in handleGetReferral; the old code
  // never wrote it, so earnings always read 0.
  const referralReward = 0.5;
  await tursoQuery(env, "UPDATE users SET referral_reward = referral_reward + ? WHERE wallet_address = ?", [referralReward, referrer]);
  await tursoQuery(env, "INSERT INTO pending_claims (user_id, wallet_address, amount, status) SELECT id, wallet_address, ?, 'pending' FROM users WHERE wallet_address = ?", [referralReward, referrer]);

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
  if (typeof walletAddress !== "string" || !WALLET_RE.test(walletAddress)) {
    return jsonResponse({ error: "Invalid wallet address" }, corsHeaders, 400);
  }
  // Campaign URLs are rendered as links/images on the site — reject
  // javascript:, data:, and anything else that isn't plain http(s).
  if (!isHttpUrl(String(ctaUrl)) || (imageUrl && !isHttpUrl(String(imageUrl)))) {
    return jsonResponse({ error: "ctaUrl and imageUrl must be http(s) URLs" }, corsHeaders, 400);
  }
  const budgetNum = Number(budget);
  const dailyBudgetNum = dailyBudget === undefined || dailyBudget === null ? null : Number(dailyBudget);
  if (!Number.isFinite(budgetNum) || budgetNum <= 0 || budgetNum > 1e9) {
    return jsonResponse({ error: "Invalid budget" }, corsHeaders, 400);
  }
  if (dailyBudgetNum !== null && (!Number.isFinite(dailyBudgetNum) || dailyBudgetNum <= 0)) {
    return jsonResponse({ error: "Invalid daily budget" }, corsHeaders, 400);
  }

  const id = "camp-" + crypto.randomUUID();
  const now = new Date().toISOString();

  await tursoQuery(env, `
    INSERT INTO ad_campaigns (id, title, description, cta, cta_url, sponsor, image_url, budget, total_budget, daily_budget, impressions, clicks, status, created_at, wallet_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'active', ?, ?)
  `, [
    id,
    String(title).slice(0, 120),
    String(description).slice(0, 500),
    typeof cta === "string" && cta ? cta.slice(0, 40) : "Learn More",
    String(ctaUrl).slice(0, 500),
    String(sponsor).slice(0, 80),
    imageUrl ? String(imageUrl).slice(0, 500) : null,
    budgetNum,
    budgetNum,
    dailyBudgetNum,
    now,
    walletAddress.toLowerCase(),
  ]);

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
  if (!(await rateLimitOk(env, request, "airdrop"))) {
    return jsonResponse({ error: "Too many requests" }, corsHeaders, 429);
  }

  const body = await request.json();
  const { walletAddress, email } = body;

  if (!walletAddress || !email) {
    return jsonResponse({ error: "Wallet address and email required" }, corsHeaders, 400);
  }

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (typeof email !== "string" || email.length > 254 || !emailRegex.test(email)) {
    return jsonResponse({ error: "Invalid email format" }, corsHeaders, 400);
  }

  // Validate wallet address (basic check)
  if (typeof walletAddress !== "string" || !WALLET_RE.test(walletAddress)) {
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

  // Mask the email: this endpoint is public and keyed only by wallet
  // address, so returning the full address book entry would let anyone
  // harvest registrant emails by wallet.
  return jsonResponse({
    registered: true,
    walletAddress: row[0],
    email: maskEmail(row[1]),
    registeredAt: row[2],
    notified: row[3] === "1",
    claimed: row[4] === "1",
  }, corsHeaders);
}
