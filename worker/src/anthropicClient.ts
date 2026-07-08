// Thin wrapper around @anthropic-ai/sdk for the two call shapes this Worker
// needs: plain-text turn generation and structured-output feedback.
//
// Model: claude-haiku-4-5 for every endpoint (CLAUDE.md / SPEC.md §3 — do not
// upgrade without planning-model sign-off).
//
// Structured outputs: `output_config: {format: {type: "json_schema", schema}}`
// on the plain (non-beta) `messages.create()` call. No beta header required;
// claude-haiku-4-5 supports structured outputs. (Verified via the claude-api
// skill reference, not from training-data memory — Anthropic's structured
// outputs surface changed after this model's cutoff.)
//
// Workers runtime: @anthropic-ai/sdk's default transport is fetch-based and
// works on Cloudflare Workers without Node-only APIs for the plain
// messages.create() call used here. This has NOT been exercised against a
// live deployment in this change — `wrangler dev` should be used to confirm
// (see README). If it turns out the SDK reaches for a Node API we don't get
// on Workers, the fallback is a hand-rolled fetch() against
// https://api.anthropic.com/v1/messages with the same headers/body shape.

import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage } from "./types";

export const MODEL = "claude-haiku-4-5";

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/** Extracts the first text block's content, or "" if none. */
function firstText(content: Anthropic.ContentBlock[]): string {
  for (const block of content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

/**
 * POST /v1/turn call shape: system prompt + full message history in,
 * a single plain-text reply out. max_tokens: 300, temperature: 1.0 per
 * SPEC.md §3.
 */
export async function generateTurn(
  apiKey: string,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    temperature: 1.0,
    system: systemPrompt,
    messages: toAnthropicMessages(messages),
  });
  return firstText(response.content);
}

/**
 * POST /v1/feedback call shape: system prompt (filled feedback template) +
 * single user message (formatted transcript) in, JSON matching
 * FEEDBACK_SCHEMA out via structured outputs. max_tokens: 1500 per
 * SPEC.md §3.
 */
export async function generateFeedback(
  apiKey: string,
  systemPrompt: string,
  transcriptUserMessage: string,
  schema: Record<string, unknown>
): Promise<unknown> {
  const client = new Anthropic({ apiKey });

  // output_config.format constrains the response to the given JSON schema.
  // The installed @anthropic-ai/sdk's TS types may lag the API's structured-
  // outputs surface (this shape is a relatively recent addition to the
  // Messages API — see the claude-api skill reference), so `output_config`
  // is built as an untyped request body and the response is cast back to
  // the non-streaming `Message` shape. This keeps the code compiling without
  // silently picking the SDK's streaming overload (which lacks `.content`).
  // If a future SDK version types `output_config` on
  // `MessageCreateParamsNonStreaming` directly, this cast can be dropped.
  const requestBody: Record<string, unknown> = {
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: transcriptUserMessage }],
    output_config: { format: { type: "json_schema", schema } },
  };

  const response = (await client.messages.create(
    requestBody as unknown as Anthropic.MessageCreateParamsNonStreaming
  )) as Anthropic.Message;

  const text = firstText(response.content);
  return JSON.parse(text);
}
