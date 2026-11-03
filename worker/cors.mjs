/**
 * Strict browser-origin policy for the Worker API.
 *
 * Previously any https://*.vercel.app origin was reflected in
 * Access-Control-Allow-Origin. Any Vercel account can host a page on that
 * suffix, so an attacker-controlled preview could read public API responses
 * and submit forms from a browser. Preview origins are now an explicit,
 * operator-configured allowlist; unrecognized origins never get an ACAO header
 * that reflects their own value.
 */

const PRODUCTION_ORIGINS = Object.freeze([
  "https://junctiongenerator.net",
  "https://www.junctiongenerator.net",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const FALLBACK_ORIGIN = "https://junctiongenerator.net";

function validHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function allowedOrigins(env = {}) {
  const configured = String(env.ALLOWED_PREVIEW_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => validHttpsOrigin(origin));
  return new Set([...PRODUCTION_ORIGINS, ...configured]);
}

export function corsHeadersFor(request, env = {}) {
  const origin = request.headers.get("Origin") || "";
  const allowed = allowedOrigins(env).has(origin) ? origin : FALLBACK_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
