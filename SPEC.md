# SoundingBoard — Build Spec v1

*iOS app (Expo/React Native): practice difficult conversations with an AI persona that pushes back realistically, or vent and get coached toward what you'd actually say. Communication-skills practice — never therapy.*

*This spec is authoritative. Validation research behind every decision: `C:\dev\ideas\soundingboard-VALIDATION.md`. Do not re-litigate positioning or scope.*

---

## 1. Product thesis (from validation — binding)

1. **Persona pushback quality is the entire product.** Users specifically value AI that argues back; LLMs decay into agreeableness. The persona prompts in `prompts/` are the moat — implement around them exactly, never rewrite them.
2. **Vent mode is the retention engine; rehearsal is the acquisition hook.** Rehearsal is episodic (practice → have the talk → churn); venting recurs. Both modes ship in v1.
3. **Personal-life scenarios are the headline** (family, breakup, roommate, friendship). Workplace scenarios included but secondary — the field over-serves workplace.
4. **Positioning is load-bearing:** "communication practice," never "therapy," "companion," "emotional support," or "mental health." This keeps the age rating at 4+/12+ and avoids Apple guideline 1.4.1 (Woebot died on this line) and the 18+ companion-app bucket (Replika/Vent precedent).

## 2. Product flow

### Mode A — Rehearse
1. **Pick scenario**: category grid (Family, Relationship, Roommate, Friendship, Work) → preset scenarios (e.g. "Set a boundary with a parent", "Ask for a raise", "Confront a roommate about chores") or "Describe your own."
2. **Set up the other person** (one screen): their name/label, relationship, temperament picker (Dismissive / Defensive / Guilt-tripping / Hot-tempered / Cold & withdrawn), what you want out of the conversation (free text, 1–2 lines), difficulty slider (1 Gentle / 2 Realistic / 3 Hard mode).
3. **Session**: push-to-talk conversation (hold-to-record → on-device STT → text to Worker → persona reply text → TTS audio plays + bubble renders). Transcript shown as chat bubbles. Typed input available as fallback. "End & get feedback" button always visible.
4. **Feedback report**: three scores (Clarity, Composure, Assertiveness, each 1–5), up to 3 key moments (quote from the user + what worked or what to try instead), one thing to practice, short encouragement. "Practice again" re-runs the same setup at same or higher difficulty.

### Mode B — Vent
1. One tap from home → open mic (same push-to-talk UI). User rants.
2. AI responds as a **coach** (see `prompts/vent-coach.md`): briefly acknowledges, reflects the core issue back, then redirects toward action — "what do you actually want to happen?" and "let's find the words."
3. Persistent offer: **"Turn this into a practice session"** → pre-fills the Rehearse setup from the vent context. This is the vent→rehearsal funnel.
4. Vent sessions get no scores — an optional one-line takeaway only. No streaks on venting.

### Session mechanics (both modes)
- Push-to-talk: hold the mic button, release to send. NOT real-time full-duplex — no barge-in, no WebRTC. This is a v1 constraint from validation, not a limitation to engineer around.
- STT: on-device via `expo-speech-recognition` (wraps `SFSpeechRecognizer`; requires an EAS dev build, not Expo Go).
- TTS: Worker proxies Cartesia Sonic (streaming endpoint, play on arrival via `expo-av`/`expo-audio`). Voice selected per temperament (map defined in Worker config). Device TTS (`expo-speech`) is the offline/error fallback only.
- Turn cap: 30 persona turns per session, then the app nudges to feedback. Sessions are ephemeral by default; transcript is kept on-device only (see privacy).

## 3. Architecture

```
[Expo app] --HTTPS--> [Cloudflare Worker] --> Anthropic API (claude-haiku-4-5)
                                        \--> Cartesia TTS API
```

Thin-Worker pattern, same as PureFork: the Worker holds `ANTHROPIC_API_KEY` and `CARTESIA_API_KEY` as secrets, attaches them, forwards, streams back. No accounts, no server-side conversation storage.

### Worker endpoints
| Endpoint | In | Out |
|---|---|---|
| `POST /v1/turn` | `{ mode: "rehearse"\|"vent", persona: {name, relationship, temperament, goal, difficulty}, messages: [{role, content}...], turn_index }` | `{ reply: string }` (persona/coach text) |
| `POST /v1/tts` | `{ text, temperament }` | audio stream (Cartesia proxied) |
| `POST /v1/feedback` | `{ persona, messages }` | Feedback JSON (schema below) — uses structured outputs |

### Worker implementation requirements
- `@anthropic-ai/sdk` (works on Workers runtime). Model: **`claude-haiku-4-5`** for all three endpoints.
- `/v1/turn`: system prompt assembled from `prompts/persona-system.md` (rehearse) or `prompts/vent-coach.md` (vent) with placeholders filled from `persona`. `max_tokens: 300`, `temperature: 1.0`. **Every 8 turns** (`turn_index % 8 === 0`), prepend the `<persona_reminder>` block (defined inside the prompt file) to the user message content — this is the anti-agreeableness re-injection; do not skip it.
- `/v1/feedback`: uses `output_config: {format: {type: "json_schema", schema: FEEDBACK_SCHEMA}}` with the schema in `prompts/feedback.md`. `max_tokens: 1500`.
- Rate limiting: per-device-ID counter in Workers KV — 40 turns/hour, 400/day free-tier hard stop; paid entitlement flag lifts to 1200/day. Return 429 with a friendly JSON error the app renders.
- Input-side guard: reject requests > 4000 chars of user content per turn. Output-side safety lives in the prompts (crisis break-character rule); Worker additionally scans user text for crisis keywords and, on match, returns the fixed crisis response verbatim from the prompt file *without* calling the model.
- CORS locked to app; no logging of message content (log counts + latency only).

### Prompts are owned by the planning model
`prompts/persona-system.md`, `prompts/vent-coach.md`, `prompts/feedback.md` are the product. Implementing agents wire them in verbatim (placeholder substitution only) and never edit their content. Changes go through the planning model.

## 4. App structure (Expo Router)

```
app/
  (tabs)/index.tsx        Home: two mode cards + recent sessions list
  rehearse/setup.tsx      Scenario picker + persona setup form
  session/[id].tsx        Session screen (both modes; mode via param)
  feedback/[id].tsx       Feedback report
  vent.tsx                Vent entry (jumps straight into session)
  paywall.tsx             RevenueCat paywall
  settings.tsx            Disclaimer, AI consent status, data deletion, restore purchases
onboarding: 2 screens — value prop, then the AI-consent screen (below).
```
- State: Zustand. Stores: `sessionStore` (active session, messages, turn count), `historyStore` (persisted past sessions — AsyncStorage, on-device only), `entitlementStore` (RevenueCat).
- Audio: `expo-speech-recognition` (STT), `expo-av` playback of Worker TTS stream, `expo-speech` fallback.
- Recent sessions: setup + transcript + feedback stored locally only. Settings has "Delete all my data" (wipes AsyncStorage).

## 5. App Store compliance (binding — from validation)

1. **First-run AI consent screen** (Apple 5.1.2(i), Nov 2025): before the first session, an explicit screen: "Your conversation is processed by a third-party AI service to generate responses. Conversations aren't stored on our servers. [Privacy Policy]" with an explicit **Agree & continue** button. Not a buried link.
2. **Disclaimer** (onboarding + settings, verbatim): *"SoundingBoard is a communication-practice tool. It is not a substitute for professional medical, legal, psychological, or emergency advice, and it does not diagnose, treat, or provide therapy for any condition. If you're in crisis or experiencing a mental health emergency, contact a licensed professional or emergency services."*
3. **Banned words in all UI copy and App Store metadata**: therapy, therapist, counseling, treatment, diagnose, heal, mental health, emotional support, companion, friend (as a noun for the AI). Allowed framing: practice, rehearse, coach, roleplay, communication skills, confidence.
4. Category: **Productivity**. Age rating: answer the questionnaire honestly per feature; target 12+; nothing in prompts may generate content that forces higher.
5. No persistent cross-session AI memory of the user's personal life (companion-pattern risk + privacy). Each session starts fresh; "Practice again" re-uses the setup config only.
6. 4.3(b) defense = feature depth: scenario library, persona setup, difficulty levels, scored feedback reports. Never a bare chat screen.
7. **Google Play (Android) — researched 2026-07-13, work list in `store/play-compliance.md`:** the six rules above are Apple App Store specific. The Play-side items (P-1…P-9) in `store/play-compliance.md` are binding for any Play submission; P-1 (in-app "report this response" control) is the only net-new feature and hard-blocks submission. Do not assume Apple's rules translate directly. Local dev/sideload builds and testing are unaffected.

## 6. Monetization

- RevenueCat (`react-native-purchases`). Products: `sb_monthly_999` ($9.99/mo), `sb_annual_4999` ($49.99/yr, badge "save 58%"). 
- Free tier: 3 full sessions (either mode), then feedback reports gated + session cap 5 turns. Paywall shows after 3rd session ends and from any gate.
- Paywall copy leads with the outcome ("Walk in prepared"), not the tech. No trial in v1 (validation: episodic users abuse trials); annual plan is the anchor.
- **Android:** `react-native-purchases` already supports Google Play Billing, but this needs its own Play Console product IDs and a separate `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`, mirroring the existing iOS pattern in `app/src/lib/purchases.ts`. Not set up yet — tracked as a follow-up, same status as the still-unconfigured iOS RevenueCat project.

## 7. Cost model (validated 2026-07)

Per 10-min session (~15 persona turns): Haiku ~$0.03 uncached worst case, TTS ~$0.30 (Cartesia $0.05/1k chars × ~6k chars). Subscriber at 4 sessions/mo ≈ **$1.30 API cost** vs $8.49 net revenue (15% Apple SBP) → ~85% margin. Breakeven ~26 sessions/mo — rate limits above make abuse unprofitable-proof.

## 8. Phase plan

- **P0 (today)**: repo, spec, prompts, Worker (all 3 endpoints + rate limit + tests), Expo scaffold, typed-input session loop end-to-end (no audio), feedback screen, persona stress-test script.
- **P1**: push-to-talk STT + TTS playback, onboarding + consent, settings, history.
- **P2**: RevenueCat + paywall + gates, app icon/branding, EAS build, TestFlight.
- **P3**: App Store metadata (compliance-checked against §5), screenshots, submit.

## 9. Cut list (binding — do not build)

No real-time full-duplex voice / WebRTC / barge-in. No accounts/auth. No cross-session AI memory. No community/sharing features. No human coaching. No streaks/gamification. No scenario marketplace. No push notifications in v1. No web app. No fake-call feature (separate idea, parked).

**Android ships as a second v1 platform** (decision reversed 2026-07-12 — originally cut, now in scope; the user's explicit call, not an implementing-agent judgment). Worker and app code are shared as-is; no Worker changes were needed. Platform-specific store-compliance and monetization work is tracked separately and is *not yet done* — see §5 and §6.

## 10. Kill-criterion gate (before P2 spend)

Run `worker/scripts/persona-stress-test.ts` (15-turn adversarial conversation against the real API, difficulty 3): the persona must not concede before the scripted "effective technique" turns, and must concede after them. If Haiku 4.5 can't hold character, escalate model choice back to the planning model — do not silently upgrade to a pricier model.
