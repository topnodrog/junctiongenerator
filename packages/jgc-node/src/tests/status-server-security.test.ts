import { afterEach, describe, expect, it } from "@jest/globals";
import {
  allowedStatusOrigins,
  startStatusServer,
  type NodeStatus,
  type StatusServerHandle,
} from "../network/status-server.js";

const handles: StatusServerHandle[] = [];

const provider = (): NodeStatus => ({
  running: true, version: "test", network: "jgtc-testnet-v2",
  startedAt: 0, uptimeSec: 0, height: 0, peerCount: 0, chain: true,
  address: "1QGC" + "a".repeat(40), label: null, balanceJGC: "123",
  pendingJGC: "0", model: null, role: "back-checker", participating: false,
});

async function serve(opts: Parameters<typeof startStatusServer>[1] = {}): Promise<StatusServerHandle> {
  const handle = await startStatusServer(provider, { port: 0, host: "127.0.0.1", ...opts });
  handles.push(handle);
  return handle;
}

async function url(handle: StatusServerHandle, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`http://127.0.0.1:${handle.port}${path}`, init);
}

afterEach(async () => {
  for (const handle of handles.splice(0)) await handle.close();
});

describe("status server origin and route isolation", () => {
  it("does not reflect unrecognized origins or grant private-network access", async () => {
    const handle = await serve({ allowedOrigins: ["https://allowed.example"] });
    const response = await url(handle, "/healthz", { headers: { Origin: "https://evil.example" } });
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-private-network")).toBeNull();

    const preflight = await url(handle, "/status", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Private-Network": "true" },
    });
    expect(preflight.status).toBe(403);
    expect(preflight.headers.get("access-control-allow-private-network")).toBeNull();
  });

  it("emits PNA only for an allowlisted origin on a loopback bind", async () => {
    const handle = await serve({ allowedOrigins: ["https://allowed.example"] });
    const allowed = await url(handle, "/status", {
      method: "OPTIONS",
      headers: { Origin: "https://allowed.example", "Access-Control-Request-Private-Network": "true" },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://allowed.example");
    expect(allowed.headers.get("access-control-allow-private-network")).toBe("true");

    const publicHandle = await serve({
      host: "0.0.0.0",
      allowedOrigins: ["https://allowed.example"],
      publicApiOnly: true,
    });
    const pnaOnPublicBind = await fetch(`http://127.0.0.1:${publicHandle.port}/healthz`, {
      method: "OPTIONS",
      headers: { Origin: "https://allowed.example", "Access-Control-Request-Private-Network": "true" },
    });
    expect(pnaOnPublicBind.headers.get("access-control-allow-private-network")).toBeNull();
  });

  it("keeps private /status off a non-loopback bind while public routes work", async () => {
    const handle = await serve({
      host: "0.0.0.0",
      publicApiOnly: true,
      publicApi: {
        explorer: () => ({ height: 7 }) as never,
        balance: () => ({ balanceJGTC: "0" }) as never,
      },
    });
    const status = await url(handle, "/status");
    expect(status.status).toBe(404);
    expect((await status.json()) as { error: string }).toEqual({ error: "not found" });
    expect((await url(handle, "/")).status).toBe(404);
    expect((await url(handle, "/healthz")).status).toBe(200);
    expect((await url(handle, "/explorer")).status).toBe(200);
    expect((await url(handle, "/balance?address=bad")).status).toBe(200);
    expect((await url(handle, "/explorer", { method: "POST" })).status).toBe(405);
  });

  it("requires a token when private status is explicitly exposed publicly", async () => {
    await expect(startStatusServer(provider, {
      port: 0, host: "0.0.0.0", allowPrivateStatusOnPublicBind: true,
    })).rejects.toThrow(/requires statusToken/);

    const handle = await serve({
      host: "0.0.0.0", statusToken: "operator-only-secret",
      allowPrivateStatusOnPublicBind: true,
    });
    expect((await url(handle, "/status")).status).toBe(401);
    const authorized = await url(handle, "/status", {
      headers: { Authorization: "Bearer operator-only-secret" },
    });
    expect(authorized.status).toBe(200);
    expect((await authorized.json() as NodeStatus).balanceJGC).toBe("123");
  });

  it("never returns private data on a public-API-only listener", async () => {
    const handle = await serve({ publicApiOnly: true });
    expect((await url(handle, "/status")).status).toBe(404);
    expect((await url(handle, "/")).status).toBe(404);
  });

  it("resolves a strict default allowlist", () => {
    expect(allowedStatusOrigins("127.0.0.1")).toContain("http://localhost:3000");
    expect(allowedStatusOrigins("0.0.0.0")).toEqual([
      "https://junctiongenerator.net", "https://www.junctiongenerator.net",
    ]);
  });
});
