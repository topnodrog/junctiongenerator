// Cloudflare Worker API for JGT Attention Mining
// Deploy to: workers.cloudflare.com
// Required env vars: TURSO_URL, TURSO_AUTH_TOKEN, API_SECRET

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route: Register a new ad view (called when user watches an ad)
      if (path === '/api/ad-view' && request.method === 'POST') {
        return await handleAdView(request, env, corsHeaders);
      }

      // Route: Get user stats
      if (path === '/api/user' && request.method === 'GET') {
        return await handleGetUser(request, env, corsHeaders);
      }

      // Route: Subscribe to newsletter
      if (path === '/api/subscribe' && request.method === 'POST') {
        return await handleSubscribe(request, env, corsHeaders);
      }

      // Route: Get pending rewards (for admin dashboard)
      if (path === '/api/pending-rewards' && request.method === 'GET') {
        return await handlePendingRewards(request, env, corsHeaders);
      }

      // Route: Trigger daily dispense (called by cron)
      if (path === '/api/dispense' && request.method === 'POST') {
        return await handleDispense(request, env, corsHeaders);
      }

      // Route: Health check
      if (path === '/api/health') {
        return jsonResponse({ status: 'ok', service: 'JGT Mining API' }, corsHeaders);
      }

      return jsonResponse({ error: 'Not found' }, corsHeaders, 404);
    } catch (err) {
      console.error('API Error:', err);
      return jsonResponse({ error: 'Internal server error' }, corsHeaders, 500);
    }
  },
};

// Handle ad view registration
async function handleAdView(request, env, corsHeaders) {
  const body = await request.json();
  const { walletAddress, adIndex, rewardAmount, sessionId } = body;

  if (!walletAddress || adIndex === undefined || !rewardAmount) {
    return jsonResponse({ error: 'Missing required fields' }, corsHeaders, 400);
  }

  // Normalize wallet address
  const wallet = walletAddress.toLowerCase();

  // Upsert user
  await env.DB.prepare(`
    INSERT INTO users (wallet_address, session_count, last_session_at)
    VALUES (?, 1, datetime('now'))
    ON CONFLICT(wallet_address) DO UPDATE SET
      session_count = session_count + 1,
      last_session_at = datetime('now')
  `).bind(wallet).run();

  // Get user ID
  const user = await env.DB.prepare(
    'SELECT id FROM users WHERE wallet_address = ?'
  ).bind(wallet).first();

  // Upsert session
  const sid = sessionId || `${wallet}-${Date.now()}`;
  await env.DB.prepare(`
    INSERT INTO sessions (user_id, wallet_address, ads_watched, session_reward, status)
    VALUES (?, ?, 1, ?, 'active')
    ON CONFLICT DO UPDATE SET
      ads_watched = ads_watched + 1,
      session_reward = session_reward + ?
  `).bind(user.id, wallet, rewardAmount, rewardAmount).run();

  // Get session ID
  const session = await env.DB.prepare(
    'SELECT id FROM sessions WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(user.id, 'active').first();

  // Record ad view
  await env.DB.prepare(`
    INSERT INTO ad_views (user_id, session_id, ad_index, reward_amount)
    VALUES (?, ?, ?, ?)
  `).bind(user.id, session.id, adIndex, rewardAmount).run();

  // Add to pending claims
  await env.DB.prepare(`
    INSERT INTO pending_claims (user_id, wallet_address, amount, status)
    VALUES (?, ?, ?, 'pending')
  `).bind(user.id, wallet, rewardAmount).run();

  // Update user totals
  await env.DB.prepare(`
    UPDATE users SET
      total_rewards_earned = total_rewards_earned + ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(rewardAmount, user.id).run();

  return jsonResponse({
    success: true,
    wallet,
    rewardAmount,
    message: 'Ad view recorded. Reward added to pending claims.',
  }, corsHeaders);
}

// Get user stats
async function handleGetUser(request, env, corsHeaders) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get('wallet')?.toLowerCase();

  if (!wallet) {
    return jsonResponse({ error: 'Wallet address required' }, corsHeaders, 400);
  }

  const user = await env.DB.prepare(`
    SELECT
      u.wallet_address,
      u.total_rewards_earned,
      u.total_rewards_claimed,
      u.session_count,
      u.email,
      u.created_at,
      COALESCE(SUM(pc.amount), 0) as pending_rewards
    FROM users u
    LEFT JOIN pending_claims pc ON pc.user_id = u.id AND pc.status = 'pending'
    WHERE u.wallet_address = ?
    GROUP BY u.id
  `).bind(wallet).first();

  if (!user) {
    return jsonResponse({ error: 'User not found' }, corsHeaders, 404);
  }

  return jsonResponse({ user }, corsHeaders);
}

// Newsletter subscription
async function handleSubscribe(request, env, corsHeaders) {
  const body = await request.json();
  const { email, walletAddress } = body;

  if (!email) {
    return jsonResponse({ error: 'Email required' }, corsHeaders, 400);
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return jsonResponse({ error: 'Invalid email format' }, corsHeaders, 400);
  }

  try {
    await env.DB.prepare(`
      INSERT INTO newsletter_subscribers (email, wallet_address)
      VALUES (?, ?)
      ON CONFLICT(email) DO UPDATE SET
        wallet_address = COALESCE(?, wallet_address),
        active = 1
    `).bind(email.toLowerCase(), walletAddress?.toLowerCase() || null, walletAddress?.toLowerCase() || null).run();

    return jsonResponse({
      success: true,
      message: 'Subscribed to JGT newsletter!',
    }, corsHeaders);
  } catch (err) {
    return jsonResponse({ error: 'Subscription failed' }, corsHeaders, 500);
  }
}

// Get pending rewards (admin)
async function handlePendingRewards(request, env, corsHeaders) {
  const pending = await env.DB.prepare(`
    SELECT
      wallet_address,
      SUM(amount) as total_pending,
      COUNT(*) as claim_count
    FROM pending_claims
    WHERE status = 'pending'
    GROUP BY wallet_address
    ORDER BY total_pending DESC
  `).all();

  const summary = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT wallet_address) as unique_users,
      SUM(amount) as total_pending,
      COUNT(*) as total_claims
    FROM pending_claims
    WHERE status = 'pending'
  `).first();

  return jsonResponse({
    summary,
    recipients: pending.results,
  }, corsHeaders);
}

// Daily dispense handler (called by cron)
async function handleDispense(request, env, corsHeaders) {
  // Verify cron secret
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
  }

  // Get all pending claims grouped by wallet
  const pending = await env.DB.prepare(`
    SELECT
      wallet_address,
      SUM(amount) as total_amount,
      COUNT(*) as claim_count
    FROM pending_claims
    WHERE status = 'pending'
    GROUP BY wallet_address
    HAVING total_amount > 0
  `).all();

  if (!pending.results || pending.results.length === 0) {
    return jsonResponse({ message: 'No pending claims to process' }, corsHeaders);
  }

  // Create batch record
  const batchId = `batch-${Date.now()}`;
  const totalAmount = pending.results.reduce((sum, r) => sum + r.total_amount, 0);

  await env.DB.prepare(`
    INSERT INTO dispense_batches (batch_id, total_amount, recipient_count, status)
    VALUES (?, ?, ?, 'processing')
  `).bind(batchId, totalAmount, pending.results.length).run();

  // Mark claims as processing
  await env.DB.prepare(`
    UPDATE pending_claims SET status = 'processing', batch_id = ?
    WHERE status = 'pending'
  `).bind(batchId).run();

  // Return the batch data for the off-chain dispenser to process
  // The actual on-chain transaction will be submitted separately
  return jsonResponse({
    success: true,
    batchId,
    totalAmount,
    recipientCount: pending.results.length,
    recipients: pending.results,
    message: 'Batch ready for on-chain submission',
  }, corsHeaders);
}

// Helper: JSON response
function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
