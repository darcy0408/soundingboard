import type { Context } from "hono";
import type { Env, TtsRequest, ErrorResponse, Temperament } from "../types";
import { CARTESIA_TTS_URL, CARTESIA_VERSION, buildCartesiaRequestBody, TEMPERAMENT_VOICE_IDS } from "../cartesia";

const MAX_TTS_TEXT_CHARS = 4000;

function isValidTemperament(t: unknown): t is Temperament {
  return typeof t === "string" && Object.prototype.hasOwnProperty.call(TEMPERAMENT_VOICE_IDS, t);
}

function isValidTtsRequest(body: unknown): body is TtsRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return typeof b.text === "string" && b.text.length > 0 && isValidTemperament(b.temperament);
}

export async function handleTts(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    const err: ErrorResponse = { error: "invalid_json", message: "Request body must be valid JSON." };
    return c.json(err, 400);
  }

  if (!isValidTtsRequest(body)) {
    const err: ErrorResponse = {
      error: "invalid_request",
      message: "Request body did not match the expected /v1/tts shape.",
    };
    return c.json(err, 400);
  }

  if (body.text.length > MAX_TTS_TEXT_CHARS) {
    const err: ErrorResponse = {
      error: "content_too_large",
      message: `TTS text exceeds ${MAX_TTS_TEXT_CHARS} characters.`,
    };
    return c.json(err, 413);
  }

  if (!c.env.CARTESIA_API_KEY) {
    // No Cartesia key configured — tell the app to fall back to on-device
    // TTS (expo-speech) rather than failing the session (SPEC.md §3).
    const err: ErrorResponse = {
      error: "tts_unavailable",
      message: "Server-side TTS is not configured. Use on-device TTS.",
    };
    return c.json(err, 501);
  }

  const start = Date.now();
  try {
    const cartesiaResponse = await fetch(CARTESIA_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.CARTESIA_API_KEY}`,
        "Cartesia-Version": CARTESIA_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildCartesiaRequestBody(body.text, body.temperament)),
    });

    if (!cartesiaResponse.ok || !cartesiaResponse.body) {
      console.log(
        JSON.stringify({
          route: "/v1/tts",
          status: 502,
          latencyMs: Date.now() - start,
          upstreamStatus: cartesiaResponse.status,
        })
      );
      const err: ErrorResponse = { error: "upstream_error", message: "TTS provider request failed." };
      return c.json(err, 502);
    }

    console.log(JSON.stringify({ route: "/v1/tts", status: 200, latencyMs: Date.now() - start }));
    // Streaming passthrough — mp3 bytes straight to the app.
    return new Response(cartesiaResponse.body, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err) {
    console.log(JSON.stringify({ route: "/v1/tts", status: 502, latencyMs: Date.now() - start }));
    const errRes: ErrorResponse = { error: "upstream_error", message: "Failed to reach TTS provider." };
    return c.json(errRes, 502);
  }
}
