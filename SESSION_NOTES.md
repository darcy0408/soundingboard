# Session notes

## 2026-07-11 — Worker deployed to production; kill-criterion gate cleared; P2 RevenueCat/paywall built

**Done:**
- Deployed the Cloudflare Worker to production: `https://soundingboard-api.darcy0408.workers.dev`. Created the `RATE_LIMIT` KV namespace (+ preview) and pasted real ids into `worker/wrangler.toml`, set the `ANTHROPIC_API_KEY` secret via `wrangler secret put`. Verified all three endpoints against the live deployment with `curl` — `/v1/turn` returns an in-character reply, `/v1/feedback` returns valid structured JSON, `/v1/tts` correctly returns `501 tts_unavailable` (no Cartesia key set yet, app falls back to on-device TTS as designed). This also confirms `@anthropic-ai/sdk` works fine on the Workers runtime against a real API key — the "not verified" risk flagged in `worker/README.md` from the previous session is resolved.
- Along the way, the user ran `npm audit fix --force` in `worker/`, which bumped `wrangler` 3→4 and `vitest` 2→4 (both major versions). Re-verified after the bump: `tsc --noEmit` clean, 65/65 tests still pass. Committed intentionally rather than reverted.
- Ran the SPEC.md §10 kill-criterion gate: `worker/scripts/persona-stress-test.ts` against the real API (Linda, Guilt-tripping, difficulty 3, 15 scripted turns). The script's own automated verdict said **FAIL**, but human review of the transcript found the two flagged "concessions" (turns 2 and 4) were false positives from the script's simple keyword heuristic — turn 2 matched on `/i guess/i` inside a sarcastic guilt-trip line, turn 4 matched bare `/\bokay\b/i` inside "make sure you're okay" (nothing to do with agreement). The persona actually held its ground through all 5 ineffective moves and conceded appropriately at turn 11, inside the required window. Treated as a **PASS** on human override — this is exactly the fallback behavior the script's docstring describes ("a human can override a borderline verdict"), not a real Haiku failure. Did not act on the "escalate model choice" clause in SPEC.md §10 since the actual gate criteria were met.
- Built P2 monetization end-to-end in the app: `app/src/lib/purchases.ts` (new) wraps `react-native-purchases@10.4.2` — configure, fetch offerings, purchase, restore, and sync `entitlementStore.isPro` from `CustomerInfo` — verified against the installed package's actual TypeScript declarations, not assumed API shape. `paywall.tsx` now shows real RevenueCat prices (falling back to SPEC.md §6's static $9.99/$49.99 copy when unconfigured) and drives real purchases with loading/error/cancellation handling; the manual dev-only unlock toggle is now gated behind `__DEV__`. `settings.tsx`'s "Restore Purchases" is wired for real. The whole path is designed to no-op safely with no RevenueCat project configured — verified this is the current state and the rest of the app (free-session gating, dev toggle) still works. `tsc --noEmit` and `expo lint` both clean in `app/` after all of this.
- Found and fixed a pre-existing bug: the root `.gitignore`'s `.env.*` rule was silently blocking `app/.env.example` from ever being committed — confirmed via `git ls-files` that it was never tracked, even in the original P0 commit. Added a `!.env.example` negation so the env-var template (including the new `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` line) actually ships with the repo.
- Answered the user's question about what iPhone to buy for device testing: checked the actually-installed `expo-speech-recognition@56.0.1` package's podspec (not the latest GitHub README, which is for a newer, uninstalled version) — real floor is iOS 16.4, meaning iPhone 8 or newer in principle. Recommended iPhone 11+ (used, ~$100–250) as the practical sweet spot, and noted no cellular plan is needed for the EAS dev-client workflow, only Wi-Fi.
- Two commits pushed to `origin/master`: `8bf5292` (Worker deploy config + dependency bumps) and `c0742e2` (RevenueCat/paywall wiring + the `.gitignore` fix).

**Decisions:**
- Treating the stress-test gate as passed via human review of the transcript, not the script's automated verdict. **Why:** the automated heuristic is simple keyword matching (documented as approximate in the script itself) and produced two clear false positives on turns 2 and 4. **How to apply:** future sessions should read this script's printed transcript by eye when the automated verdict disagrees with a persona clearly holding character before turn 6 and conceding after turn 10 — don't treat "FAIL" as automatically blocking without that check. Worth tightening the regex heuristic eventually (non-blocking).
- RevenueCat entitlement identifier is hardcoded as `"pro"` in `src/lib/purchases.ts` (`PRO_ENTITLEMENT_ID`). **Why:** SPEC.md §6 defines product IDs but not an entitlement identifier — this needed a concrete value to write real code. **How to apply:** when setting up the RevenueCat dashboard, either name the entitlement `pro` or update that constant to match — documented in `app/README.md`'s new "Monetization setup" section.
- Kept `ALLOWED_ORIGIN = "*"` in `worker/wrangler.toml` for this deploy rather than tightening it now. **Why:** there's no app build to point it at yet (no device), and tightening prematurely would just mean re-tightening later. **How to apply:** must be done before any real TestFlight/App Store submission (SPEC.md §3) — tracked in Next below.

**Next:**
1. **Get an iPhone** (in progress, user's own task) — iOS 16.4+ needed; iPhone 11 or newer recommended, used market, no cellular plan required.
2. Once a device exists: `npx eas login`, then `npx eas build --profile development --platform ios` from `app/` — first real device build. This will also be the first real test of whether `expo-speech-recognition` (the flagged risk below) actually works, and now additionally bundles the new `react-native-purchases` native module.
3. Install the build on the device (link/QR from step 2), run `npx expo start --dev-client`, and work through the 11-step device checklist in `app/README.md`'s "Running on device" section.
4. Independently of the device (can happen anytime): set up RevenueCat per `app/README.md`'s "Monetization setup" section — App Store Connect products, RevenueCat project, entitlement named `pro`, offering with monthly/annual packages, then set `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`.
5. Before any real submission: tighten `ALLOWED_ORIGIN` in `worker/wrangler.toml`, and publish `store/privacy-policy.md` at a public URL (still not done — Apple requires this at submission).

**Blocked on user:**
- Buying an iPhone for device testing (discussed sizing/budget this session, not yet done).
- Apple Developer Program membership ($99/yr) — needed for `eas build`'s automatic credential setup and for creating products in App Store Connect. Status not confirmed this session; worth checking explicitly next time rather than assuming, since step 2 above will fail without it.
- RevenueCat account + project creation, if real purchases are wanted before the App Store Connect products exist.
- Cartesia account (optional — TTS still falls back to on-device speech without it, unchanged from last session).

**Risks/unverified:**
- `expo-speech-recognition` native module still has zero real-device verification — this remains the single biggest build risk, unchanged from last session, and is now gated purely on getting a physical iPhone.
- `src/lib/purchases.ts` is code-complete and typechecks, but has never run against a real RevenueCat project — the `"pro"` entitlement identifier and the assumption that `offering.monthly`/`offering.annual` will be populated (rather than needing custom package identifiers) are unverified against an actual dashboard configuration.
- The persona-stress-test script's keyword-based concession detector has known false positives (see Decisions above) — fine to keep working around by eye, but worth tightening in a future session so it stops requiring manual override on every run.
- Cartesia API shape and voice IDs in `worker/src/cartesia.ts` remain unverified against a live Cartesia account (unchanged from last session).

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
