import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV === "development";
  const endpoints = [process.env.NEXT_PUBLIC_API_URL, process.env.NEXT_PUBLIC_TESTNET_API_URL,
    process.env.NEXT_PUBLIC_NODE_STATUS_URL].filter(Boolean).map((value) => new URL(value!).origin);
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com https://static.cloudflareinsights.com${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // The existing React components use style attributes throughout the site.
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com https://jgt-mining-api.james-gordon.workers.dev https://seed-a.junctiongenerator.net http://127.0.0.1:7777 http://localhost:7777 ${endpoints.join(" ")}${development ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "frame-src https://challenges.cloudflare.com",
    "img-src 'self' data: blob:", "font-src 'self'", "object-src 'none'",
    "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  // Next.js uses this request header to nonce its own hydration scripts.
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(process.env.CSP_REPORT_ONLY === "true"
    ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|xml|txt|ttf)$).*)",
};
