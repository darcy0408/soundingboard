import { describe, it, expect } from "vitest";
import type { Env } from "../src/types";
import app from "../src/index";

function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    RATE_LIMIT: {} as Env["RATE_LIMIT"],
    ANTHROPIC_API_KEY: "test-key",
    ...overrides,
  };
}

describe("POST /v1/tts", () => {
  it("returns 501 tts_unavailable when CARTESIA_API_KEY is not configured", async () => {
    const env = fakeEnv({ CARTESIA_API_KEY: undefined });
    const res = await app.request(
      "/v1/tts",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Hello there", temperament: "Dismissive" }),
      },
      env
    );
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("tts_unavailable");
  });

  it("returns 400 for an unknown temperament", async () => {
    const env = fakeEnv({ CARTESIA_API_KEY: "cartesia-test-key" });
    const res = await app.request(
      "/v1/tts",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Hello there", temperament: "Furious" }),
      },
      env
    );
    expect(res.status).toBe(400);
  });

  it("returns 413 when text exceeds the length guard", async () => {
    const env = fakeEnv({ CARTESIA_API_KEY: "cartesia-test-key" });
    const res = await app.request(
      "/v1/tts",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "x".repeat(4001), temperament: "Dismissive" }),
      },
      env
    );
    expect(res.status).toBe(413);
  });
});
