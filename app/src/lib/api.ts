import { getDeviceId } from '@/lib/device-id';
import type { ChatMessage, FeedbackResult, PersonaConfig, SessionMode, Temperament } from '@/lib/types';
import { useEntitlementStore } from '@/stores/entitlementStore';

// Matches worker/src Worker contract in SPEC.md §3 — do not change endpoint shapes here without
// checking the Worker implementation stays in sync.
// The localhost fallback exists for dev only. Release builds must set EXPO_PUBLIC_WORKER_URL
// (EAS env var / eas.json env block) — an unset value in a release build fails loudly below
// instead of silently shipping a build pointed at localhost.
const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL ?? (__DEV__ ? 'http://localhost:8787' : '');

function requireWorkerUrl(): string {
  if (!WORKER_URL) {
    throw new ApiError(
      0,
      'This build is missing its server address (EXPO_PUBLIC_WORKER_URL). Please update the app.',
    );
  }
  return WORKER_URL;
}

/** Server-side guard is authoritative (SPEC §3); this mirrors it so we can fail fast client-side. */
export const MAX_TURN_CHARS = 4000;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const deviceId = await getDeviceId();
  // Worker rate limiter (SPEC §3): 40/hr + 400/day free, 1200/day once entitled. There's no
  // accounts/receipt-validation system (cut list), so this is client-asserted anti-abuse
  // signal, not a billing control — the Worker's own comment on this says the same.
  const isEntitled = useEntitlementStore.getState().isPro;

  let response: Response;
  try {
    response = await fetch(`${requireWorkerUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
        'x-entitled': isEntitled ? 'true' : 'false',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    let message =
      response.status === 429
        ? "You've hit the practice limit for now — try again a bit later."
        : `Request failed (${response.status}).`;
    try {
      // Worker's ErrorResponse shape is { error: <code>, message: <friendly text> } — `error`
      // is a machine-readable slug like "rate_limited", `message` is what to show the user.
      const data = (await response.json()) as { error?: string; message?: string };
      if (data?.message) message = data.message;
    } catch {
      // Body wasn't JSON — fall back to the generic message above.
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

interface TurnResponse {
  reply: string;
}

// Vent mode has no persona setup screen (SPEC §2, Mode B), but the /v1/turn request shape
// always includes a `persona` object (SPEC §3 table). vent-coach.md has no placeholders, so the
// Worker never reads these fields for mode "vent" — this is just filler to satisfy the contract.
const VENT_STUB_PERSONA: PersonaConfig = {
  name: 'Vent',
  relationship: 'coach',
  temperament: 'Dismissive',
  goal: '',
  difficulty: 2,
};

/**
 * POST /v1/turn — sends the conversation so far and gets the next persona/coach reply.
 * `turnIndex` is the 1-based number of this persona turn (used server-side for the
 * anti-agreeableness reminder injected every 8th turn — see prompts/persona-system.md).
 */
export async function sendTurn(
  config: PersonaConfig | null,
  messages: ChatMessage[],
  turnIndex: number,
  mode: SessionMode
): Promise<string> {
  const { reply } = await post<TurnResponse>('/v1/turn', {
    mode,
    persona: config ?? VENT_STUB_PERSONA,
    messages,
    turn_index: turnIndex,
  });
  return reply;
}

/** POST /v1/feedback — scores + moments for a completed rehearsal transcript. */
export async function getFeedback(
  config: PersonaConfig,
  messages: ChatMessage[]
): Promise<FeedbackResult> {
  return post<FeedbackResult>('/v1/feedback', {
    persona: config,
    messages,
  });
}

/**
 * POST /v1/tts — returns raw MP3 bytes for `text` spoken in the voice mapped to `temperament`
 * (worker/src/cartesia.ts TEMPERAMENT_VOICE_IDS), or throws ApiError. Unlike `post<T>()` above,
 * the success response is binary (audio/mpeg), not JSON, so this doesn't reuse that helper.
 *
 * Callers should always catch ApiError here — the Worker returns 501 when no Cartesia key is
 * configured (SPEC.md §3), and the contract is to fall back to on-device TTS (expo-speech) on any
 * failure (501, network error, rate limit, upstream error), never to break the chat flow.
 */
export async function fetchTtsAudio(text: string, temperament: Temperament): Promise<Uint8Array> {
  const deviceId = await getDeviceId();
  const isEntitled = useEntitlementStore.getState().isPro;

  let response: Response;
  try {
    response = await fetch(`${requireWorkerUrl()}/v1/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
        'x-entitled': isEntitled ? 'true' : 'false',
      },
      body: JSON.stringify({ text, temperament }),
    });
  } catch {
    throw new ApiError(0, "Couldn't reach the server for voice playback.");
  }

  if (!response.ok) {
    let message = `TTS request failed (${response.status}).`;
    try {
      const data = (await response.json()) as { error?: string; message?: string };
      if (data?.message) message = data.message;
    } catch {
      // Body wasn't JSON — fall back to the generic message above.
    }
    throw new ApiError(response.status, message);
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}
