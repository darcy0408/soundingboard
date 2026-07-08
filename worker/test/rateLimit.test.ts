import { describe, it, expect } from "vitest";
import {
  evaluateRateLimit,
  checkAndRecordTurn,
  HOUR_LIMIT,
  DAY_LIMIT_FREE,
  DAY_LIMIT_ENTITLED,
  hourBucket,
  dayBucket,
} from "../src/rateLimit";
import type { Env } from "../src/types";

/** Minimal in-memory KVNamespace fake — only the methods rateLimit.ts uses. */
function createFakeKv() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    // Unused by rateLimit.ts, present to satisfy the KVNamespace shape loosely.
    async delete(key: string) {
      store.delete(key);
    },
    _store: store,
  };
}

function fakeEnv(): Env {
  return {
    RATE_LIMIT: createFakeKv() as unknown as Env["RATE_LIMIT"],
    ANTHROPIC_API_KEY: "test-key",
  };
}

describe("evaluateRateLimit (pure)", () => {
  it("allows under both limits", () => {
    const d = evaluateRateLimit(0, 0, DAY_LIMIT_FREE);
    expect(d.allowed).toBe(true);
  });

  it("allows at hourCount = HOUR_LIMIT - 1", () => {
    const d = evaluateRateLimit(HOUR_LIMIT - 1, 0, DAY_LIMIT_FREE);
    expect(d.allowed).toBe(true);
  });

  it("blocks at hourCount = HOUR_LIMIT with scope 'hour'", () => {
    const d = evaluateRateLimit(HOUR_LIMIT, 0, DAY_LIMIT_FREE);
    expect(d.allowed).toBe(false);
    expect(d.scope).toBe("hour");
  });

  it("blocks at dayCount = dayLimit with scope 'day' when hour is fine", () => {
    const d = evaluateRateLimit(0, DAY_LIMIT_FREE, DAY_LIMIT_FREE);
    expect(d.allowed).toBe(false);
    expect(d.scope).toBe("day");
  });

  it("hour check takes precedence when both limits are hit", () => {
    const d = evaluateRateLimit(HOUR_LIMIT, DAY_LIMIT_FREE, DAY_LIMIT_FREE);
    expect(d.allowed).toBe(false);
    expect(d.scope).toBe("hour");
  });

  it("entitled day limit is higher (1200) than free (400)", () => {
    const d = evaluateRateLimit(0, DAY_LIMIT_FREE, DAY_LIMIT_ENTITLED);
    expect(d.allowed).toBe(true);
    const blocked = evaluateRateLimit(0, DAY_LIMIT_ENTITLED, DAY_LIMIT_ENTITLED);
    expect(blocked.allowed).toBe(false);
    expect(blocked.scope).toBe("day");
  });
});

describe("checkAndRecordTurn (KV-backed)", () => {
  it("increments the hour and day counters on each allowed call", async () => {
    const env = fakeEnv();
    const now = new Date("2026-07-08T10:00:00Z");

    const first = await checkAndRecordTurn(env, "device-1", false, now);
    expect(first.allowed).toBe(true);
    expect(first.hourCount).toBe(0); // count observed BEFORE increment

    const second = await checkAndRecordTurn(env, "device-1", false, now);
    expect(second.allowed).toBe(true);
    expect(second.hourCount).toBe(1);
  });

  it("blocks the 41st turn within the same hour", async () => {
    const env = fakeEnv();
    const now = new Date("2026-07-08T10:00:00Z");

    for (let i = 0; i < HOUR_LIMIT; i++) {
      const d = await checkAndRecordTurn(env, "device-2", false, now);
      expect(d.allowed).toBe(true);
    }
    const blocked = await checkAndRecordTurn(env, "device-2", false, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.scope).toBe("hour");
  });

  it("does not block a new device sharing the same hour bucket window", async () => {
    const env = fakeEnv();
    const now = new Date("2026-07-08T10:00:00Z");
    for (let i = 0; i < HOUR_LIMIT; i++) {
      await checkAndRecordTurn(env, "device-3", false, now);
    }
    const otherDevice = await checkAndRecordTurn(env, "device-4", false, now);
    expect(otherDevice.allowed).toBe(true);
  });

  it("resets the hour counter in a new hour bucket but keeps the day counter", async () => {
    const env = fakeEnv();
    const hour1 = new Date("2026-07-08T10:30:00Z");
    const hour2 = new Date("2026-07-08T11:05:00Z"); // next UTC hour bucket

    for (let i = 0; i < HOUR_LIMIT; i++) {
      await checkAndRecordTurn(env, "device-5", false, hour1);
    }
    const blockedStillHour1 = await checkAndRecordTurn(env, "device-5", false, hour1);
    expect(blockedStillHour1.allowed).toBe(false);

    const allowedInHour2 = await checkAndRecordTurn(env, "device-5", false, hour2);
    expect(allowedInHour2.allowed).toBe(true);
    // Day counter carried over from hour1's HOUR_LIMIT turns.
    expect(allowedInHour2.dayCount).toBe(HOUR_LIMIT);
  });

  it("entitled devices get the higher day limit", async () => {
    const env = fakeEnv();
    const now = new Date("2026-07-08T10:00:00Z");
    // Directly seed the day counter near the free limit by writing through
    // checkAndRecordTurn across many distinct hour buckets isn't practical
    // here — instead verify the dayLimit value passed through the decision.
    const decision = await checkAndRecordTurn(env, "device-6", true, now);
    expect(decision.dayLimit).toBe(DAY_LIMIT_ENTITLED);
    const freeDecision = await checkAndRecordTurn(env, "device-7", false, now);
    expect(freeDecision.dayLimit).toBe(DAY_LIMIT_FREE);
  });
});

describe("bucket helpers", () => {
  it("hourBucket encodes year/month/day/hour", () => {
    expect(hourBucket(new Date("2026-07-08T05:09:00Z"))).toBe("2026070805");
  });

  it("dayBucket encodes year/month/day", () => {
    expect(dayBucket(new Date("2026-07-08T23:59:00Z"))).toBe("20260708");
  });
});
