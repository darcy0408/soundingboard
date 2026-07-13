import { describe, it, expect, vi, afterEach } from "vitest";
import type { Env } from "../src/types";
import { REPORT_DAY_LIMIT } from "../src/routes/report";

import app from "../src/index";

// Fake KV that exposes its backing store so tests can inspect what a report
// actually persisted (same shape as the fakes in turnRoute.test.ts, plus the
// exposed Map).
function createFakeKv() {
  const store = new Map<string, string>();
  const kv = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  } as unknown as Env["RATE_LIMIT"];
  return { kv, store };
}

function fakeEnv(store?: { kv: Env["RATE_LIMIT"] }): Env {
  return {
    RATE_LIMIT: store?.kv ?? createFakeKv().kv,
    ANTHROPIC_API_KEY: "test-key",
  };
}

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    mode: "rehearse",
    reported_message: "an inappropriate persona reply",
    context_messages: [
      { role: "user", content: "what I said before" },
      { role: "assistant", content: "an earlier reply" },
    ],
    ...overrides,
  };
}

function postReport(env: Env, body: unknown, deviceId = "device-r") {
  return app.request(
    "/v1/report",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(deviceId ? { "x-device-id": deviceId } : {}),
      },
      body: JSON.stringify(body),
    },
    env
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /v1/report — happy path", () => {
  it("stores the report in KV under a report: key and returns ok", async () => {
    const fake = createFakeKv();
    const env = fakeEnv(fake);

    const res = await postReport(env, makeReport());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const reportKeys = [...fake.store.keys()].filter((k) => k.startsWith("report:"));
    expect(reportKeys).toHaveLength(1);
    const stored = JSON.parse(fake.store.get(reportKeys[0])!);
    expect(stored.mode).toBe("rehearse");
    expect(stored.deviceId).toBe("device-r");
    expect(stored.reported_message).toBe("an inappropriate persona reply");
    expect(stored.context_messages).toHaveLength(2);
    expect(stored.reason).toBeNull();
    expect(typeof stored.ts).toBe("string");
  });

  it("never logs report content — only route/status/latency", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const env = fakeEnv();

    await postReport(env, makeReport({ reported_message: "SECRET-CONTENT-MARKER" }));

    for (const call of logSpy.mock.calls) {
      expect(String(call[0])).not.toContain("SECRET-CONTENT-MARKER");
    }
  });
});

describe("POST /v1/report — guards", () => {
  it("returns 400 when x-device-id header is missing", async () => {
    const res = await postReport(fakeEnv(), makeReport(), "");
    expect(res.status).toBe(400);
  });

  it("returns 400 when reported_message is missing", async () => {
    const res = await postReport(fakeEnv(), makeReport({ reported_message: undefined }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on a bad mode", async () => {
    const res = await postReport(fakeEnv(), makeReport({ mode: "chat" }));
    expect(res.status).toBe(400);
  });

  it("returns 413 when the reported message exceeds 4000 characters", async () => {
    const res = await postReport(fakeEnv(), makeReport({ reported_message: "x".repeat(4001) }));
    expect(res.status).toBe(413);
  });

  it("returns 413 when a context message exceeds 4000 characters", async () => {
    const res = await postReport(
      fakeEnv(),
      makeReport({ context_messages: [{ role: "user", content: "x".repeat(4001) }] })
    );
    expect(res.status).toBe(413);
  });

  it("returns 429 once the daily report cap is hit, and stops storing reports", async () => {
    const fake = createFakeKv();
    const env = fakeEnv(fake);

    for (let i = 0; i < REPORT_DAY_LIMIT; i++) {
      const res = await postReport(env, makeReport());
      expect(res.status).toBe(200);
    }
    const blocked = await postReport(env, makeReport());
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string };
    expect(body.error).toBe("rate_limited");

    const reportKeys = [...fake.store.keys()].filter((k) => k.startsWith("report:"));
    expect(reportKeys).toHaveLength(REPORT_DAY_LIMIT);
  });
});
