// Per-device rate limiting via Workers KV (SPEC.md §3/§4):
//   40 turns/hour, 400/day free-tier hard stop, 1200/day for entitled users.
//
// NOTE on consistency: Workers KV has no atomic increment primitive (that
// requires Durable Objects, which SPEC.md does not call for). This
// implementation does a read-then-write, which is subject to a race under
// truly concurrent requests from the same device — acceptable here because
// this is abuse-prevention for a free/cheap product surface, not a billing
// control (SPEC.md §7's margin math tolerates some slop). If tighter
// guarantees are ever needed, migrate the counter to a Durable Object.

import type { Env } from "./types";

export const HOUR_LIMIT = 40;
export const DAY_LIMIT_FREE = 400;
export const DAY_LIMIT_ENTITLED = 1200;

export type RateLimitScope = "hour" | "day";

export interface RateLimitDecision {
  allowed: boolean;
  scope?: RateLimitScope;
  hourCount: number;
  dayCount: number;
  dayLimit: number;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC hour bucket, e.g. "2026070800" for 2026-07-08T00:xx UTC. */
export function hourBucket(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(
    date.getUTCHours()
  )}`;
}

/** UTC day bucket, e.g. "20260708". */
export function dayBucket(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function hourKey(deviceId: string, date: Date): string {
  return `rl:h:${deviceId}:${hourBucket(date)}`;
}

function dayKey(deviceId: string, date: Date): string {
  return `rl:d:${deviceId}:${dayBucket(date)}`;
}

const HOUR_TTL_SECONDS = 60 * 65; // a little over an hour
const DAY_TTL_SECONDS = 60 * 60 * 26; // a little over a day

async function readCount(kv: KVNamespace, key: string): Promise<number> {
  const raw = await kv.get(key);
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Pure decision logic, exported separately so it's trivially unit-testable
 *  without a KV binding. */
export function evaluateRateLimit(
  hourCount: number,
  dayCount: number,
  dayLimit: number
): RateLimitDecision {
  if (hourCount >= HOUR_LIMIT) {
    return { allowed: false, scope: "hour", hourCount, dayCount, dayLimit };
  }
  if (dayCount >= dayLimit) {
    return { allowed: false, scope: "day", hourCount, dayCount, dayLimit };
  }
  return { allowed: true, hourCount, dayCount, dayLimit };
}

/**
 * Checks the current counts for `deviceId` against the limits and, if
 * allowed, increments both counters. Returns the decision made. This is a
 * single read-then-write pass (see race-condition note above).
 */
export async function checkAndRecordTurn(
  env: Env,
  deviceId: string,
  entitled: boolean,
  now: Date = new Date()
): Promise<RateLimitDecision> {
  const hKey = hourKey(deviceId, now);
  const dKey = dayKey(deviceId, now);
  const dayLimit = entitled ? DAY_LIMIT_ENTITLED : DAY_LIMIT_FREE;

  const [hourCount, dayCount] = await Promise.all([
    readCount(env.RATE_LIMIT, hKey),
    readCount(env.RATE_LIMIT, dKey),
  ]);

  const decision = evaluateRateLimit(hourCount, dayCount, dayLimit);
  if (!decision.allowed) {
    return decision;
  }

  await Promise.all([
    env.RATE_LIMIT.put(hKey, String(hourCount + 1), { expirationTtl: HOUR_TTL_SECONDS }),
    env.RATE_LIMIT.put(dKey, String(dayCount + 1), { expirationTtl: DAY_TTL_SECONDS }),
  ]);

  return decision;
}
