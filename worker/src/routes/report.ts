// POST /v1/report — the in-app "report this AI response" control required by
// Google Play's AI-Generated Content policy (store/play-compliance.md P-1).
// Stores the flagged reply plus the conversation turns the user consented to
// send in KV (prefix "report:") for periodic human review. Reuses the existing
// RATE_LIMIT namespace rather than adding a binding — reports are low-volume
// and the prefix keeps them cleanly listable (`wrangler kv key list`).

import type { Context } from "hono";
import type { Env, ReportRequest, ErrorResponse, ChatMessage } from "../types";
import { dayBucket } from "../rateLimit";

const MAX_REPORTED_CHARS = 4000;
const MAX_CONTEXT_MESSAGES = 12;
const MAX_REASON_CHARS = 500;

/** Per-device daily cap — far above any genuine use, cheap to hit for abuse. */
export const REPORT_DAY_LIMIT = 20;

/** Reports are a moderation log, not analytics — KV expires them after 90 days. */
const REPORT_TTL_SECONDS = 60 * 60 * 24 * 90;
const REPORT_COUNT_TTL_SECONDS = 60 * 60 * 26; // a little over a day, same as rateLimit.ts

function isValidChatMessages(value: unknown): value is ChatMessage[] {
  if (!Array.isArray(value)) return false;
  for (const m of value) {
    if (!m || typeof m !== "object") return false;
    const mm = m as Record<string, unknown>;
    if (mm.role !== "user" && mm.role !== "assistant") return false;
    if (typeof mm.content !== "string") return false;
  }
  return true;
}

function isValidReportRequest(body: unknown): body is ReportRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.mode !== "rehearse" && b.mode !== "vent") return false;
  if (typeof b.reported_message !== "string" || b.reported_message.length === 0) return false;
  if (b.context_messages !== undefined && !isValidChatMessages(b.context_messages)) return false;
  if (b.reason !== undefined && typeof b.reason !== "string") return false;
  return true;
}

export async function handleReport(c: Context<{ Bindings: Env }>): Promise<Response> {
  const deviceId = c.req.header("x-device-id");
  if (!deviceId) {
    const err: ErrorResponse = { error: "missing_device_id", message: "x-device-id header is required." };
    return c.json(err, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    const err: ErrorResponse = { error: "invalid_json", message: "Request body must be valid JSON." };
    return c.json(err, 400);
  }

  if (!isValidReportRequest(body)) {
    const err: ErrorResponse = {
      error: "invalid_request",
      message: "Request body did not match the expected /v1/report shape.",
    };
    return c.json(err, 400);
  }

  if (
    body.reported_message.length > MAX_REPORTED_CHARS ||
    (body.reason?.length ?? 0) > MAX_REASON_CHARS ||
    (body.context_messages ?? []).length > MAX_CONTEXT_MESSAGES ||
    (body.context_messages ?? []).some((m) => m.content.length > MAX_REPORTED_CHARS)
  ) {
    const err: ErrorResponse = {
      error: "content_too_large",
      message: "Report exceeds the allowed size.",
    };
    return c.json(err, 413);
  }

  // Same read-then-write pattern (and race tolerance) as rateLimit.ts.
  const countKey = `rl:rep:${deviceId}:${dayBucket(new Date())}`;
  const rawCount = await c.env.RATE_LIMIT.get(countKey);
  const count = rawCount ? parseInt(rawCount, 10) || 0 : 0;
  if (count >= REPORT_DAY_LIMIT) {
    const err: ErrorResponse = {
      error: "rate_limited",
      message: "You've sent the maximum number of reports for today.",
    };
    return c.json(err, 429);
  }

  const start = Date.now();
  const record = {
    ts: new Date().toISOString(),
    deviceId,
    mode: body.mode,
    reported_message: body.reported_message,
    context_messages: body.context_messages ?? [],
    reason: body.reason ?? null,
  };
  // ISO timestamp first so `wrangler kv key list --prefix=report:` sorts chronologically.
  const reportKey = `report:${record.ts}:${crypto.randomUUID()}`;

  await Promise.all([
    c.env.RATE_LIMIT.put(reportKey, JSON.stringify(record), { expirationTtl: REPORT_TTL_SECONDS }),
    c.env.RATE_LIMIT.put(countKey, String(count + 1), { expirationTtl: REPORT_COUNT_TTL_SECONDS }),
  ]);

  // Same logging rule as every other route: route/status/latency only, never content.
  console.log(JSON.stringify({ route: "/v1/report", status: 200, latencyMs: Date.now() - start }));
  return c.json({ ok: true }, 200);
}
