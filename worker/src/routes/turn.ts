import type { Context } from "hono";
import type { Env, TurnRequest, TurnResponse, ErrorResponse, ChatMessage } from "../types";
import { generateTurn, MODEL } from "../anthropicClient";
import {
  buildRehearseSystemPrompt,
  buildVentSystemPrompt,
  applyReminderIfDue,
} from "../promptAssembly";
import { containsCrisisLanguage, CRISIS_RESPONSE } from "../crisis";
import { checkAndRecordTurn } from "../rateLimit";

const MAX_USER_CONTENT_CHARS = 4000;

function lastUserMessage(messages: ChatMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return undefined;
}

function isValidTurnRequest(body: unknown): body is TurnRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.mode !== "rehearse" && b.mode !== "vent") return false;
  if (!b.persona || typeof b.persona !== "object") return false;
  if (!Array.isArray(b.messages)) return false;
  if (typeof b.turn_index !== "number") return false;
  const persona = b.persona as Record<string, unknown>;
  if (
    typeof persona.name !== "string" ||
    typeof persona.relationship !== "string" ||
    typeof persona.temperament !== "string" ||
    typeof persona.goal !== "string" ||
    typeof persona.difficulty !== "number"
  ) {
    return false;
  }
  for (const m of b.messages as unknown[]) {
    if (!m || typeof m !== "object") return false;
    const mm = m as Record<string, unknown>;
    if (mm.role !== "user" && mm.role !== "assistant") return false;
    if (typeof mm.content !== "string") return false;
  }
  return true;
}

export async function handleTurn(c: Context<{ Bindings: Env }>): Promise<Response> {
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

  if (!isValidTurnRequest(body)) {
    const err: ErrorResponse = { error: "invalid_request", message: "Request body did not match the expected /v1/turn shape." };
    return c.json(err, 400);
  }

  const userText = lastUserMessage(body.messages);
  if (userText !== undefined && userText.length > MAX_USER_CONTENT_CHARS) {
    const err: ErrorResponse = {
      error: "content_too_large",
      message: `User message content exceeds ${MAX_USER_CONTENT_CHARS} characters.`,
    };
    return c.json(err, 413);
  }

  // Crisis pre-filter — return the fixed message WITHOUT calling the model.
  if (userText && containsCrisisLanguage(userText)) {
    const res: TurnResponse = { reply: CRISIS_RESPONSE };
    return c.json(res, 200);
  }

  // Rate limit. SPEC.md §3: 40 turns/hour, 400/day free, 1200/day entitled.
  // Entitlement is client-asserted via x-entitled (RevenueCat check happens
  // app-side; there is no accounts/receipt-validation system in v1 per the
  // cut list) — treat this as an anti-abuse throttle, not a billing control.
  const entitled = c.req.header("x-entitled") === "true";
  const decision = await checkAndRecordTurn(c.env, deviceId, entitled);
  if (!decision.allowed) {
    const err: ErrorResponse = {
      error: "rate_limited",
      message: "You've hit today's practice limit.",
    };
    return c.json(err, 429);
  }

  const systemPrompt =
    body.mode === "rehearse" ? buildRehearseSystemPrompt(body.persona) : buildVentSystemPrompt();
  const messages = applyReminderIfDue(body.messages, body.persona, body.turn_index, body.mode);

  const start = Date.now();
  try {
    const reply = await generateTurn(c.env.ANTHROPIC_API_KEY, systemPrompt, messages);
    logRoute(c, "/v1/turn", 200, Date.now() - start);
    const res: TurnResponse = { reply };
    return c.json(res, 200);
  } catch (err) {
    logRoute(c, "/v1/turn", 502, Date.now() - start);
    const errRes: ErrorResponse = { error: "upstream_error", message: "Failed to generate a reply." };
    return c.json(errRes, 502);
  }
}

/** No logging of message content anywhere — log only route, status, latency. */
function logRoute(_c: Context<{ Bindings: Env }>, route: string, status: number, latencyMs: number): void {
  console.log(JSON.stringify({ route, status, latencyMs, model: MODEL }));
}
