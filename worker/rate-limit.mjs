const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export async function rateLimitOk(env, request, bucket) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  const limiter = env.RATE_LIMITER;

  // Local-only escape hatch for wrangler dev without a local Rate Limiter
  // binding. Missing production bindings must never silently disable limits.
  if (!limiter) {
    if (LOOPBACK_HOSTS.has(hostname)) return true;
    throw new Error("Rate limiter unavailable");
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  try {
    const result = await limiter.limit({ key: `${bucket}:${ip}` });
    return result?.success === true;
  } catch {
    // Fail closed on binding errors; do not log IPs, request data, or upstream details.
    throw new Error("Rate limiter unavailable");
  }
}
