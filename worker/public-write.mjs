const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const PUBLIC_ACTIONS = Object.freeze({
  "/api/subscribe": "newsletter",
  "/api/hire-lead": "hire",
  "/api/community/join": "community-join",
  "/api/community/activate": "community-activate",
});
const MAX_BODY_BYTES = 16_384;

export async function readPublicJson(request) {
  if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
    return { status: 415, error: "Please submit this form as JSON." };
  }
  const reader = request.body?.getReader();
  if (!reader) return { status: 400, error: "Form data is required." };
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return { status: 413, error: "Form data is too large." };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid form");
    return { body };
  } catch {
    return { status: 400, error: "Invalid form data." };
  } finally { reader.releaseLock(); }
}

/** Accept a single-use Cloudflare token only for this hostname and form action. */
export async function validateTurnstile(request, env, body, action, fetcher = fetch) {
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_HOSTNAMES) {
    return { status: 503, error: "Form verification is temporarily unavailable. Please email James." };
  }
  const token = body.turnstileToken;
  if (typeof token !== "string" || !token.trim() || token.length > 2048) {
    return { status: 400, error: "Please complete the verification and try again." };
  }
  const hostnames = env.TURNSTILE_HOSTNAMES.split(",").map((host) => host.trim()).filter(Boolean);
  try {
    const response = await fetcher(SITEVERIFY_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token,
        remoteip: request.headers.get("CF-Connecting-IP") || undefined }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Verification unavailable");
    const result = await response.json();
    if (result.success !== true || result.action !== action || !hostnames.includes(result.hostname)) {
      return { status: 400, error: "Verification failed or expired. Please try again." };
    }
    return { status: 200 };
  } catch {
    // Do not log submitted tokens, secret keys, or contact details.
    return { status: 503, error: "Form verification is temporarily unavailable. Please try again." };
  }
}
