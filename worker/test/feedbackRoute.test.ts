import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../src/types";

vi.mock("../src/anthropicClient", () => ({
  MODEL: "claude-haiku-4-5",
  generateTurn: vi.fn(),
  generateFeedback: vi.fn(),
}));

import app from "../src/index";
import { generateFeedback } from "../src/anthropicClient";

function fakeEnv(): Env {
  return {
    RATE_LIMIT: {} as Env["RATE_LIMIT"],
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

const validFeedback = {
  scores: { clarity: 4, composure: 3, assertiveness: 4 },
  moments: [
    { quote: "I need us to talk on Sundays instead.", type: "worked", note: "Specific request." },
  ],
  one_thing: "Make one request and stop talking.",
  encouragement: "You held your boundary calmly.",
};

beforeEach(() => {
  vi.mocked(generateFeedback).mockReset();
});

describe("POST /v1/feedback", () => {
  it("returns the parsed feedback JSON from the model, truncating moments to 3", async () => {
    const manyMoments = Array.from({ length: 5 }, (_, i) => ({
      quote: `quote ${i}`,
      type: "worked",
      note: `note ${i}`,
    }));
    vi.mocked(generateFeedback).mockResolvedValue({ ...validFeedback, moments: manyMoments });

    const env = fakeEnv();
    const res = await app.request(
      "/v1/feedback",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          persona,
          messages: [
            { role: "user", content: "I need us to talk on Sundays instead." },
            { role: "assistant", content: "After everything I've done for you..." },
          ],
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof validFeedback;
    expect(body.moments).toHaveLength(3);
    expect(generateFeedback).toHaveBeenCalledTimes(1);

    // Verify the transcript passed to the model is formatted USER:/<Name>:
    const callArgs = vi.mocked(generateFeedback).mock.calls[0];
    const transcriptArg = callArgs[2];
    expect(transcriptArg).toContain("USER: I need us to talk on Sundays instead.");
    expect(transcriptArg).toContain("Diane: After everything I've done for you...");
  });

  it("returns 400 for a malformed request body", async () => {
    const env = fakeEnv();
    const res = await app.request(
      "/v1/feedback",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona: {}, messages: "not-an-array" }),
      },
      env
    );
    expect(res.status).toBe(400);
    expect(generateFeedback).not.toHaveBeenCalled();
  });

  it("returns 502 when the model call fails", async () => {
    vi.mocked(generateFeedback).mockRejectedValue(new Error("upstream failure"));
    const env = fakeEnv();
    const res = await app.request(
      "/v1/feedback",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          persona,
          messages: [{ role: "user", content: "hello" }],
        }),
      },
      env
    );
    expect(res.status).toBe(502);
  });
});
