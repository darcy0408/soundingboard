import type { Context } from "hono";
import type { Env, FeedbackRequest, FeedbackResponse, ErrorResponse } from "../types";
import { generateFeedback } from "../anthropicClient";
import { buildFeedbackSystemPrompt, formatTranscript } from "../promptAssembly";
import { FEEDBACK_SCHEMA } from "../prompts.generated";

function isValidFeedbackRequest(body: unknown): body is FeedbackRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (!b.persona || typeof b.persona !== "object") return false;
  if (!Array.isArray(b.messages)) return false;
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

/** Defensively truncates moments to at most 3, in case the model (despite
 *  the prompt instruction) returns more — schema-level maxItems isn't
 *  supported by structured outputs (see prompts/feedback.md). */
function truncateMoments(feedback: FeedbackResponse): FeedbackResponse {
  if (Array.isArray(feedback.moments) && feedback.moments.length > 3) {
    return { ...feedback, moments: feedback.moments.slice(0, 3) };
  }
  return feedback;
}

export async function handleFeedback(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    const err: ErrorResponse = { error: "invalid_json", message: "Request body must be valid JSON." };
    return c.json(err, 400);
  }

  if (!isValidFeedbackRequest(body)) {
    const err: ErrorResponse = {
      error: "invalid_request",
      message: "Request body did not match the expected /v1/feedback shape.",
    };
    return c.json(err, 400);
  }

  const systemPrompt = buildFeedbackSystemPrompt(body.persona);
  const transcript = formatTranscript(body.messages, body.persona);

  const start = Date.now();
  try {
    const raw = await generateFeedback(c.env.ANTHROPIC_API_KEY, systemPrompt, transcript, FEEDBACK_SCHEMA);
    const feedback = truncateMoments(raw as FeedbackResponse);
    console.log(JSON.stringify({ route: "/v1/feedback", status: 200, latencyMs: Date.now() - start }));
    return c.json(feedback, 200);
  } catch (err) {
    console.log(JSON.stringify({ route: "/v1/feedback", status: 502, latencyMs: Date.now() - start }));
    const errRes: ErrorResponse = { error: "upstream_error", message: "Failed to generate feedback." };
    return c.json(errRes, 502);
  }
}
