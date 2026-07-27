# SoundingBoard

**Practice difficult conversations with an AI persona that actually pushes back.**

Most conversational AI collapses into agreeableness — it tells you what you want to hear, which is useless for rehearsing a hard talk. SoundingBoard is built around the opposite: a persona that stays in character, holds its position, and makes you work for it. Then it scores how you did.

SoundingBoard is communication-skills practice. It is not therapy, counseling, or mental-health treatment, and it makes no medical claims.

## Two modes

**Rehearse** — Pick a scenario (set a boundary with a parent, ask for a raise, confront a roommate), configure the other person (relationship, temperament, difficulty 1–3), then hold-to-talk your way through the conversation. End it and get a feedback report: scores for Clarity, Composure, and Assertiveness, up to three key moments quoted back with what worked or what to try instead, and one thing to practice.

**Vent** — Open the mic and rant. The AI responds as a coach: acknowledges briefly, reflects the core issue back, then redirects toward action — *what do you actually want to happen, and what are the words?* Any vent can be converted into a rehearsal session pre-filled from its context.

## How it works

```
[Expo app]  ──HTTPS──▶  [Cloudflare Worker]  ──▶  Anthropic API (claude-haiku-4-5)
                                             └──▶  Cartesia Sonic (TTS)
```

- **Speech-to-text** runs on-device (`expo-speech-recognition`, wrapping `SFSpeechRecognizer`) — audio never leaves the phone.
- **The Worker holds every API key.** No provider credentials ship in the app bundle.
- **Text-to-speech** streams from Cartesia and plays on arrival, with device TTS as the offline fallback. Voice is selected per persona temperament.
- Transcripts stay on-device by default; sessions are ephemeral.

## Stack

TypeScript throughout. Expo / React Native / Expo Router + Zustand on the client; Cloudflare Workers on the backend; RevenueCat for subscriptions; EAS Build for both platforms.

## Status

**Parked.** Feature-complete as a working prototype; store submission is not being pursued. The code is published as a reference implementation rather than a shipping product.

- Both modes implemented end to end against a **production-deployed Worker**
- 73 Worker tests passing; `tsc --noEmit` and `expo lint` clean across app and worker
- Store-compliance work landed: published privacy policy, mic prominent-disclosure, report-AI-response control, CORS locked down
- Android and iOS store submissions not completed

The parts most likely to be useful to someone else: the Worker-as-credential-boundary pattern in `worker/`, the on-device speech recognition setup, and the App Store positioning analysis in `SPEC.md`.

## Layout

```
app/       Expo / React Native client
worker/    Cloudflare Worker — API proxy, prompt assembly, rate limiting, crisis routing
prompts/   Persona, vent-coach, and feedback prompts
store/     Store listing, privacy policy, compliance research
SPEC.md    Authoritative build spec
```

## A note on positioning

The "communication practice, never therapy" line in this README is deliberate and load-bearing, not marketing hedging. Apps in this space that positioned themselves as mental-health tools ran into App Store guideline 1.4.1; ones that positioned as companions landed in the 18+ bucket. The scope, the copy, and the crisis-routing behavior in `worker/src/crisis.ts` all follow from that decision. See `SPEC.md` for the full rationale.
