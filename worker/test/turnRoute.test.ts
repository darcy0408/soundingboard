import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../src/types";

// Mock the Anthropic client wrapper so no network call is ever made — tests
// assert on whether/how it was called, never on a real model response.
vi.mock("../src/anthropicClient", () => ({
  MODEL: "claude-haiku-4-5",
  generateTurn: vi.fn().mockResolvedValue("mocked persona reply"),
  generateFeedback: vi.fn(),
}));

import app from "../src/index";
import { generateTurn } from "../src/anthropicClient";

function createFakeKv() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  } as unknown as Env["RATE_LIMIT"];
}

function fakeEnv(): Env {
  return {
    RATE_LIMIT: createFakeKv(),
    ANTHROPIC_API_KEY: "test-key",
  };
}

const persona = {
  name: "Diane",
  relationship: "mother",
  temperament: "Guilt-tripping" as const,
  goal: "Set a boundary about weekly calls",
  difficulty: 2 as const,
};

beforeEach(() => {
  vi.mocked(generateTurn).mockClear();
});

describe("POST /v1/turn — crisis short-circuit", () => {
  it("returns the fixed crisis message and never calls the model", async () => {
    const env = fakeEnv();
    const res = await app.request(
      "/v1/turn",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-id": "device-a" },
        body: JSON.stringify({
          mode: "rehearse",
          persona,
          messages: [{ role: "user", content: "I want to kill myself" }],
          turn_index: 1,
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { reply: string };
    expect(body.reply).toContain("Let's pause the practice");
    expect(generateTurn).not.toHaveBeenCalled();
  });
});

describe("POST /v1/turn — reminder injection", () => {
  it("prepends the persona_reminder block to the final user message on turn 8", async () => {
    const env = fakeEnv();
    await app.request(
      "/v1/turn",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-id": "device-b" },
        body: JSON.stringify({
          mode: "rehearse",
          persona,
          messages: [
            { role: "assistant", content: "prior reply" },
            { role: "user", content: "the real message" },
          ],
          turn_index: 8,
        }),
      },
      env
    );

    expect(generateTurn).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateTurn).mock.calls[0];
    const messagesArg = callArgs[2];
    const lastUserContent = messagesArg[messagesArg.length - 1].content;
    expect(lastUserContent.startsWith("<persona_reminder>")).toBe(true);
    expect(lastUserContent).toContain("the real message");
  });

  it("does not inject the reminder on turn 7", async () => {
    const env = fakeEnv();
    await app.request(
      "/v1/turn",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-id": "device-c" },
        body: JSON.stringify({
          mode: "rehearse",
          persona,
          messages: [{ role: "user", content: "the real message" }],
          turn_index: 7,
        }),
      },
      env
    );

    const callArgs = vi.mocked(generateTurn).mock.calls[0];
    const messagesArg = callArgs[2];
    expect(messagesArg[messagesArg.length - 1].content).toBe("the real message");
  });
});

describe("POST /v1/turn — guards", () => {
  it("returns 413 when user content exceeds 4000 characters", async () => {
    const env = fakeEnv();
    const res = await app.request(
      "/v1/turn",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-id": "device-d" },
        body: JSON.stringify({
          mode: "rehearse",
          persona,
          messages: [{ role: "user", content: "x".repeat(4001) }],
          turn_index: 1,
        }),
      },
      env
    );
    expect(res.status).toBe(413);
    expect(generateTurn).not.toHaveBeenCalled();
  });

  it("returns 400 when x-device-id header is missing", async () => {
    const env = fakeEnv();
    const res = await app.request(
      "/v1/turn",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "rehearse",
          persona,
          messages: [{ role: "user", content: "hello" }],
          turn_index: 1,
        }),
      },
      env
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 with the friendly rate_limited body once the hourly cap is exceeded", async () => {
    const env = fakeEnv();
    const makeReq = () =>
      app.request(
        "/v1/turn",
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-device-id": "device-e" },
          body: JSON.stringify({
            mode: "rehearse",
            persona,
            messages: [{ role: "user", content: "hi" }],
            turn_index: 1,
          }),
        },
        env
      );

    for (let i = 0; i < 40; i++) {
      const res = await makeReq();
      expect(res.status).toBe(200);
    }
    const blocked = await makeReq();
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string; message: string };
    expect(body.error).toBe("rate_limited");
    expect(body.message).toBe("You've hit today's practice limit.");
  });
});
