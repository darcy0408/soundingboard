// Assistant-reply TTS playback (SPEC.md §2/§3/§8). Tries the Worker's Cartesia-backed
// POST /v1/tts first; falls back to on-device `expo-speech` whenever that fails for any reason
// (no Cartesia key configured -> 501, network error, rate limit, upstream error, or a local
// file-write/playback failure). Never throws — callers fire this after the reply bubble already
// rendered so voice playback never blocks the chat UI.
//
// Verified against the installed package type declarations (see final report for what was
// verified vs assumed): expo-audio's `createAudioPlayer(uri)` + `player.addListener(
// 'playbackStatusUpdate', ...)` + `AudioStatus.didJustFinish`/`AudioStatus.error`,
// expo-file-system's `new File(Paths.cache, name)` + `file.create()` + `file.write(Uint8Array)`,
// and expo-speech's `Speech.speak(text, { onDone, onStopped, onError })`.

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';

import { ApiError, fetchTtsAudio } from '@/lib/api';
import type { Temperament } from '@/lib/types';

// worker/src/cartesia.ts's TEMPERAMENT_VOICE_IDS only has voices for the 5 rehearsal-persona
// temperaments — there's no "coach" voice, and /v1/tts's isValidTemperament() rejects anything
// else with a 400. Vent mode has no persona setup screen (SPEC §2 Mode B) so there's no real
// temperament to send; reuse the same filler value api.ts's VENT_STUB_PERSONA uses for /v1/turn,
// for consistency between the two vent-mode Worker calls.
export const VENT_TTS_TEMPERAMENT: Temperament = 'Dismissive';

let audioModeConfigured = false;

// Bumped on every stopSpokenReply() call (including the implicit one at the top of every
// speakReply() call). Lets an in-flight fetch notice it's been superseded by a newer reply before
// it ever creates a player.
let playbackToken = 0;

// Stops whatever Worker-audio playback is currently in flight (queued, fetching, or actually
// playing) and settles its pending promise. Set while a playBytesAsMp3() call is active, cleared
// when it finishes for any reason. This is the single hook stopSpokenReply() uses to interrupt
// playback — without it, pausing the player wouldn't resolve/reject the promise that
// playBytesAsMp3()'s caller is awaiting, leaking both the promise and the cache file.
let activeStop: (() => void) | null = null;

async function ensureAudioMode() {
  if (audioModeConfigured) return;
  audioModeConfigured = true;
  try {
    // Play even when the phone's silent switch is on — this is spoken conversation practice
    // audio, not a notification sound, so it should behave like a media/voice app.
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch {
    // Non-fatal — playback still works with whatever the platform default is.
  }
}

/**
 * Stops and releases any in-flight Worker-TTS playback, and cancels any queued on-device
 * (expo-speech) utterance. Safe to call when nothing is playing. Call this whenever a new reply
 * starts speaking, the voice toggle is turned off, or the session screen unmounts.
 */
export function stopSpokenReply() {
  playbackToken += 1;
  if (activeStop) {
    const stop = activeStop;
    activeStop = null;
    stop();
  }
  Speech.stop().catch(() => {});
}

async function playBytesAsMp3(bytes: Uint8Array, token: number): Promise<void> {
  await ensureAudioMode();
  if (token !== playbackToken) return; // superseded while configuring the audio mode

  const file = new File(
    Paths.cache,
    `sb-tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`
  );
  file.create({ overwrite: true });
  file.write(bytes);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const player = createAudioPlayer(file.uri);

    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      // speakReply() always calls stopSpokenReply() (which clears activeStop synchronously)
      // before a new playback attempt sets it again, so at most one playBytesAsMp3() call ever
      // "owns" activeStop at a time — safe to unconditionally clear it here.
      activeStop = null;
      subscription.remove();
      try {
        player.remove();
      } catch {
        // Already released.
      }
      try {
        file.delete();
      } catch {
        // Best-effort cache cleanup — not fatal if it fails.
      }
      if (error) reject(error instanceof Error ? error : new Error('Playback failed'));
      else resolve();
    };

    // Called by stopSpokenReply() when this playback is superseded or explicitly muted — treat
    // it as a normal completion (resolve), not a failure, so speakReply() doesn't fall back to
    // on-device speech for a clip that was deliberately cut off.
    const stopThis = () => {
      try {
        player.pause();
      } catch {
        // Already released.
      }
      finish();
    };
    activeStop = stopThis;

    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.error) {
        finish(new Error(status.error));
        return;
      }
      if (status.didJustFinish) {
        finish();
      }
    });

    try {
      player.play();
    } catch (err) {
      finish(err);
    }
  });
}

function speakOnDevice(text: string): Promise<void> {
  return new Promise((resolve) => {
    Speech.speak(text, {
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

/**
 * Speaks `text` aloud for the given rehearsal `temperament` (or `VENT_TTS_TEMPERAMENT` for vent
 * mode). Tries the Worker's Cartesia-backed voice first; falls back to on-device `expo-speech` on
 * any failure. Fire-and-forget from callers — resolves once playback finishes, is superseded by a
 * newer reply, or is muted, whichever comes first.
 */
export async function speakReply(text: string, temperament: Temperament): Promise<void> {
  stopSpokenReply();
  const token = playbackToken;
  const trimmed = text.trim();
  if (!trimmed) return;

  try {
    const bytes = await fetchTtsAudio(trimmed, temperament);
    if (token !== playbackToken) return; // a newer reply started speaking while we were fetching
    await playBytesAsMp3(bytes, token);
  } catch (err) {
    if (token !== playbackToken) return;
    if (!(err instanceof ApiError)) {
      // Unexpected (file write / player) failure, as opposed to an expected Worker-side error
      // like 501 tts_unavailable — still fall back rather than staying silent, but log it since
      // it points at a local bug rather than "no Cartesia key configured".
      console.warn('[tts] Local playback failed, falling back to on-device speech:', err);
    }
    await speakOnDevice(trimmed);
  }
}
