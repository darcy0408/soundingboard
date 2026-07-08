// Cartesia TTS proxy config (SPEC.md §3: "Worker proxies Cartesia Sonic").
//
// API shape verified via web search against https://docs.cartesia.ai/api-reference/tts/bytes
// on 2026-07-08 (training cutoff predates Cartesia's structured-output /
// versioned API, so this was NOT verified from memory — treat the exact
// field names/versions below as best-effort and re-check against Cartesia's
// docs before shipping, since this is a fast-moving API):
//   POST https://api.cartesia.ai/tts/bytes
//   Headers: Authorization: Bearer <CARTESIA_API_KEY>, Cartesia-Version: 2026-03-01,
//            Content-Type: application/json
//   Body: { model_id, transcript, voice: { mode: "id", id }, output_format }
//   Response: 200 OK, audio/* bytes (streamable straight through).
//
// UNVERIFIED / flag for a human: the exact current `model_id` value (used
// "sonic-3.5" below — Cartesia has renamed sonic model ids before, e.g.
// sonic -> sonic-2 -> sonic-turbo -> sonic-3), the exact `Cartesia-Version`
// date string, and whether `output_format.container: "mp3"` still needs a
// `bit_rate` at every call site. Re-verify against the live docs (or
// Cartesia's OpenAPI spec) before the first real deploy.

export const CARTESIA_TTS_URL = "https://api.cartesia.ai/tts/bytes";
export const CARTESIA_VERSION = "2026-03-01"; // UNVERIFIED — confirm current version string.
export const CARTESIA_MODEL_ID = "sonic-3.5"; // UNVERIFIED — confirm current model id.

import type { Temperament } from "./types";

/**
 * Placeholder Cartesia voice IDs per temperament. These are NOT real
 * Cartesia voice IDs — replace with actual IDs picked from Cartesia's voice
 * library (https://play.cartesia.ai or `GET /voices`) before shipping.
 * TODO(planning-model or human): audition and pick real voices per
 * temperament; ids below are placeholders only so the code compiles/runs
 * end-to-end once a real CARTESIA_API_KEY is set.
 */
export const TEMPERAMENT_VOICE_IDS: Record<Temperament, string> = {
  Dismissive: "00000000-0000-0000-0000-000000000001",
  Defensive: "00000000-0000-0000-0000-000000000002",
  "Guilt-tripping": "00000000-0000-0000-0000-000000000003",
  "Hot-tempered": "00000000-0000-0000-0000-000000000004",
  "Cold & withdrawn": "00000000-0000-0000-0000-000000000005",
};

export function voiceIdForTemperament(temperament: Temperament): string {
  return TEMPERAMENT_VOICE_IDS[temperament] ?? TEMPERAMENT_VOICE_IDS.Dismissive;
}

/** Builds the JSON body for a /tts/bytes request. mp3 output so the Worker
 *  can pass a stable audio/mpeg content-type straight through to the app. */
export function buildCartesiaRequestBody(text: string, temperament: Temperament) {
  return {
    model_id: CARTESIA_MODEL_ID,
    transcript: text,
    voice: {
      mode: "id",
      id: voiceIdForTemperament(temperament),
    },
    output_format: {
      container: "mp3",
      sample_rate: 44100,
      bit_rate: 128000,
    },
  };
}
