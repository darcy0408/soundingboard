# Session notes

## 2026-07-07 — Project created: validated, specced, and built through P0+P1 in one day

**Done:**
- Validation research (4 parallel research agents: competitors, demand, App Store policy, voice-AI economics) — full findings in `C:\dev\ideas\soundingboard-VALIDATION.md` (outside this repo). Verdict: conditional go.
- `SPEC.md` (authoritative build spec), `CLAUDE.md` (agent ground rules), and the three conversation prompts in `prompts/` (persona roleplay, vent coach, feedback rubric — planning-model-owned, implementing agents must never edit them).
- Cloudflare Worker in `worker/`: `POST /v1/turn`, `/v1/feedback` (structured outputs), `/v1/tts` (Cartesia proxy) on `claude-haiku-4-5`; KV rate limiting; crisis-language pre-filter that answers with a fixed safety message without calling the model; prompts auto-extracted from `prompts/*.md` by `worker/scripts/extract-prompts.mjs`. Verified: 65/65 vitest tests, tsc clean, `wrangler dev` smoke-tested.
- Expo app in `app/` (SDK 57, Expo Router, Zustand): onboarding with the Apple-required AI-consent screen, scenario setup (5 categories × 3 presets, 5 temperaments, 3 difficulties), chat session screen with push-to-talk speech input (`expo-speech-recognition`) and spoken replies (Worker TTS via `expo-audio`, device-voice fallback via `expo-speech`), feedback report screen, vent mode with a "turn this into a practice session" funnel, 3-free-session gating with paywall stub, settings with delete-all-data. Verified: tsc clean now; expo lint passed at its last explicit run this session.
- App Store metadata draft, Apple reviewer notes, age-rating answers, and a draft privacy policy in `store/` — all checked against the banned-words list in `SPEC.md` §5.3.
- Adversarial review pass fixed 4 bugs (turn-counter drift on failed sends; missing 5-turn cap for gated users; `expo-file-system` not declared as a direct dependency; consent screen bypassable via deep links) plus 2 planning-model fixes (crisis check now runs before the length guard; release builds without `EXPO_PUBLIC_WORKER_URL` fail loudly instead of silently using localhost).
- Repo pushed to private GitHub: https://github.com/darcy0408/soundingboard
- `/open-session` and `/close-session` commands created (in `.claude/commands/` here and user-level at `C:\Users\Darcy\.claude\commands\`).

**Decisions:**
- Push-to-talk only in v1 — no real-time full-duplex voice/WebRTC (validation: cost + engineering risk; cut list `SPEC.md` §9 is binding).
- Model is `claude-haiku-4-5` everywhere; upgrading requires planning-model sign-off after the stress-test gate (`SPEC.md` §10).
- Positioning is "communication practice, never therapy/companion" — load-bearing for App Store approval; banned-words list applies to every user-facing string.
- Pro entitlement is asserted client-side via an `x-entitled` header (no accounts/receipt validation in v1) — treated as an anti-abuse throttle, not a billing control.
- GitHub repo created private (commercial product).

**Next:**
1. Deploy the Worker (commands in `worker/README.md`): wrangler login → create the two KV namespaces and paste IDs into `worker/wrangler.toml` → set `ANTHROPIC_API_KEY` secret (Cartesia optional) → `npm run deploy`.
2. Run the go/no-go gate: `npx tsx worker/scripts/persona-stress-test.ts` with `ANTHROPIC_API_KEY` in env. If the persona can't hold character for 15 adversarial turns, stop and revisit model choice before any P2 spend.
3. First iOS dev build: `npx eas build --profile development --platform ios` with `EXPO_PUBLIC_WORKER_URL` set to the deployed Worker URL; then run the 11-step device test checklist in `app/README.md`.
4. P2 (only after the gate passes): RevenueCat products + real paywall per `SPEC.md` §6; pick real Cartesia voice IDs (`worker/src/cartesia.ts`); tighten `ALLOWED_ORIGIN` in `worker/wrangler.toml`.
5. P3: screenshots, App Store submission using `store/metadata.md`; publish `store/privacy-policy.md` at a public URL first.

**Blocked on user:**
- Cloudflare login + API secrets (step 1 above), Anthropic API key for the stress test (step 2), Apple Developer account / EAS login for the device build (step 3), Cartesia account if Worker-side voices are wanted.

**Risks/unverified:**
- `expo-speech-recognition` (v56.x) has no SDK 57-tagged release yet — installs and typechecks, but the native module is unproven until the first real device build. This is the single biggest build risk.
- Cartesia API version string and voice IDs in `worker/src/cartesia.ts` are marked UNVERIFIED/placeholder in code comments.
- Nothing has run against the live Anthropic API yet (no key in the dev environment) — the persona stress test is the first real exercise of the prompts.
- TTS plays after full download rather than streaming ("play on arrival" per `SPEC.md` §2) — acceptable latency tradeoff for now, noted as a future improvement.
