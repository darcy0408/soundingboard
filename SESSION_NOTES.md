# Session notes

## 2026-08-28 — Midnight hackathon Phase 0: toolchain on Windows/WSL, sample contract deployed to Preview; Phase 1 contract built and tested

All work on branch `midnight-hackathon` (branched from `master`; nothing merged to `master`). Everything under `midnight/` is new this weekend — see `midnight/README.md`.

**Done:**
- **Phase 0 checkpoint met and verified on-chain.** The `compact-examples` counter compiles, proves, and deploys to Midnight **Preview** from this Windows machine. Contract address `e0e3fee37d7369c33f60824cd69a5316277c2b08f9177a016f8b9c93ee42bb78`, block 621821. Verified *independently of the deploy script* by querying the indexer directly (`contractAction` returned `__typename: "ContractDeploy"` at that address and block) — see the curl command recorded in `midnight/README.md`.
- **Toolchain installed in WSL2 Ubuntu 24.04**, not Windows: Compact CLI 0.5.2, Compact compiler **0.31.1**, Node 22.23.2 via nvm. A helper `~/mnenv.sh` (copy committed at `midnight/mnenv.sh`) fixes PATH so `node`/`npm` resolve to the WSL builds rather than Windows interop. Ubuntu's `~/.bashrc` returns early for non-interactive shells, so `bash -lc` alone does not load nvm.
- **Proof server 8.1.0** running in Docker on port 6300, health/ready/version all confirmed responding.
- **Wallet funded on Preview.** Headless test wallet at `mn_addr_preview1jrqpe9kx76vvgedz69qznxan82248t5nwrwqczyccnx0mjyms3vstl03e7`, funded 5000 tNIGHT from the faucet, NIGHT registered for DUST generation (registration fee: 1). Seed lives **outside the repo** at `~/.midnight-soundingboard/preview-wallet.json` in the WSL home, mode 0600 — this repo is public and the seed must never enter it.
- **Phase 1 contract verified** (written by a parallel session, commit `f0a1400`): `midnight/contract/src/practice_attestation.compact` plus witnesses and tests. **31/31 tests pass** across `test/practice_attestation.test.ts` (22) and `test/witness-file.test.ts` (9); `npx tsc --noEmit` exits 0.
- **Rebuilt the Phase 1 contract with full ZK.** The committed build was produced with `--skip-zk` and had no `keys/` directory, so it could not have been deployed. `npm run build` in `midnight/contract` now produces `keys/attest.prover` (2.8 MB) and `keys/attest.verifier`. For scale, the counter's prover key is 14 KB.
- **Generalised the deploy script** (`midnight/phase0-smoke/scripts/deploy.ts`, commit `09b062a`) so one verified path deploys both contracts, via `SB_CONTRACT_NAME` and `SB_CONTRACT_DIR`.

**Decisions:**
- **Pinned the compiler to 0.31.1, NOT the 0.34.0 that `compact update` installs by default.** 0.34.0 targets ledger 9; Preview, Preprod and Mainnet all still run ledger 8. Midnight's own 0.34.0 release notes say to stay on 0.31.x for deployed networks. A contract built on 0.34.0 compiles cleanly and then fails on-chain, so this would have surfaced late and expensively. Whole stack now follows the docs' Preview compatibility matrix: compiler 0.31.1, compact-runtime 0.16.0, ledger-v8, midnight-js 4.1.1, proof server 8.1.0.
- **Forced a single copy of `@midnight-ntwrk/ledger-v8` via an npm `overrides` block.** `midnight-js-protocol` pins it to exactly 8.1.0 while every `wallet-sdk-*` package asks for `^8.1.0` (resolving to 8.1.1), so npm installs two copies of the wasm module. wasm-bindgen identity-checks classes per module instance, so objects built by one copy are rejected by the other with `expected instance of LedgerParameters` — an error naming a type, not a version. **Any package mixing `midnight-js-*` with `wallet-sdk-*` needs this**, including the Phase 2 dApp.
- **Lace must use the LOCAL proof server, never the remote one.** The proof server receives the witness (the private inputs) in order to build the proof, so remote proving would send session commitments to a third party — exactly what this project claims does not happen. This is a correctness requirement for the privacy story, not a preference.
- **Deferred the Lace wallet setup rather than burning more of the user's evening on it** (see Blocked/Risks).
- Kept the Phase 0 smoke test in the repo as a working reference deploy rather than deleting it, since it is the only end-to-end-verified path we have.

**Next:**
1. **Check the result of the in-flight `practice_attestation` deploy** — it was still running when this session closed (see Risks). If it failed, the log is `/tmp/pa-deploy.log` inside WSL. Re-run with:
   `cd midnight/phase0-smoke && SB_CONTRACT_NAME=practice_attestation SB_CONTRACT_DIR=../contract/build/practice_attestation npx tsx scripts/deploy.ts`
   (Requires Docker running for the proof server, and ~15 minutes of wallet sync.)
2. **Phase 2: scaffold the attest web dApp** in `midnight/attest-app/` using the `midnight-dapp-dev` plugin. Start its `package.json` with the `ledger-v8` overrides block above. Use `FetchZkConfigProvider` (browser fetches ZK config over HTTP) rather than the `NodeZkConfigProvider` the headless scripts use, which means the compiled `keys/` and `zkir/` output must be served as static assets.
3. Build the dApp against the headless wallet path first so the demo never hard-depends on Lace, then try the DApp Connector's own `connect("preview")` against the main Lace extension — it may select the network itself regardless of Lace's settings panel.
4. Phase 3 app integration (`app/src/lib/practiceProof.ts` and the proof screen) — not started.

**Blocked on user:**
- **Lace wallet is on mainnet, not Preview.** Confirmed by its Receive address (`mn_shield-addr1re5...` — the missing `_preview` is the tell). Its Midnight settings panel configures the network by raw node/indexer URLs, which currently read `blockfrost.lw.iog.io/midnight-mainnet...`. They need to become `https://rpc.preview.midnight.network` and `https://indexer.preview.midnight.network/api/v4/graphql`, but the user could not click into those fields. Unresolved. Note the proof server there is already correctly set to Local.
- The faucet is a browser form with **no programmatic API**, so every funding step needs the user. The rate limit is **per-address** (24h), so a fresh address can be funded immediately.
- Devpost registration must use the same email as the MLH event-page registration.
- Demo video (2 minute hard cap) must be recorded Saturday.

**Risks/unverified:**
- **The `practice_attestation` deploy was still in flight at session close and its result is UNKNOWN.** Do not assume the contract is live. The counter deploy is the only on-chain deploy actually confirmed.
- **Proving time for `attest` has never been measured.** Its prover key is 2.8 MB against the counter's 14 KB, reflecting the circuit's 45 pairwise commitment comparisons. The counter proved in well under a minute; `attest` will be slower by an unknown factor. This matters for a live demo — measure it before relying on it on camera.
- **Lace Beta (`hgeekaiplokcnmakghbdfbgnlfheichg`) is deprecated and its sync is broken** — it reached 50%, then reset to 0% and stayed there, and could not build a transaction. Preview itself was healthy at the time (indexer and node both advancing), so the fault is the extension. Midnight support has moved to the main Lace extension, whose store listing still describes only Cardano and never mentions Midnight. The official Midnight docs still point at the deprecated Beta. Expect to fight this.
- **Every headless script run pays a ~13 minute wallet sync.** `InMemoryTransactionHistoryStorage` does not persist sync state, and there is no restore-from-serialized entry point in this SDK version: the sub-wallets expose `serializeState()` but only `startWithSeed`/`startWithSecretKeys`/`startWithSecretKey`/`startWithPublicKey` as builders. The only headless mitigation is a long-lived process. This does not affect the browser dApp, which uses the extension's own sync.
- Wallet SDK patterns came from a plugin skill last verified 2026-06-02; the published package versions still match its lockfile exactly, so no drift was observed, but the indexer API version differs between sources (docs say v4, the skill's examples say v3 — both are live and both work).
- The Phase 0 smoke test writes a `midnight-level-db/` directory (the private state provider's local store). It is gitignored; do not commit it.


## 2026-07-14 — Play submission prep: production deploy, live privacy policy, Android RevenueCat wiring; 18+ age rating confirmed

**Done:**
- Confirmed with the user: Google Play's IARC age rating will be **18+**, diverging intentionally from Apple's 12+ target in `SPEC.md` §5.4. Recorded in `store/play-console.md` (commit `48c6d00`).
- `app/src/lib/purchases.ts` now selects the RevenueCat public SDK key per platform (`Platform.select` between `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` and the new `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`, documented in `app/.env.example`). `app/eas.json`'s production build profile now pins `EXPO_PUBLIC_WORKER_URL` so production builds stop failing loudly for lack of it.
- **Production Worker deploy (real external action, not just local verification):** `ALLOWED_ORIGIN` in `worker/wrangler.toml` tightened from `"*"` to a fixed dead origin — native apps send no `Origin` header, so this only blocks browser JS on arbitrary websites from calling the API (`SPEC.md` §3's "CORS locked to app" requirement). Deployed to production alongside the `/v1/report` endpoint from the previous entry; a live smoke test against production came back green (Worker version `0fe9a346`).
- **Privacy policy published live (real external action):** `https://darcy0408.github.io/soundingboard-legal/`, served via GitHub Pages from a new public repo `darcy0408/soundingboard-legal`. `store/privacy-policy.md` in *this* repo remains the source of truth — edit there first, then mirror to the public repo. Wired into the app's onboarding consent screen and settings screen (`app/src/app/onboarding/consent.tsx`, `app/src/app/settings.tsx`, `app/src/lib/copy.ts`), replacing launch-placeholder links.
- **Play Age Signals API (P-7) researched and decided:** submitting to Play without integrating it. Google's policy states Play does not mandate this API for submission; of the relevant state laws, only Texas's is currently in effect (Utah delayed to May 2027, Louisiana to July 2027). Two caveats recorded in `store/play-console.md`: there's an unresolved Google Play developer-community thread specifically asking about the 18+ case, worth a manual read before submitting; and this decision should be revisited before mid-2027. No official Expo/React Native wrapper exists for this API — a future integration would need a custom or third-party native module.
- **Play Console submission-checklist discovery:** personal Google Play developer accounts created after 2023-11-13 must complete a closed test with 12+ opted-in testers for 14 consecutive days before getting production access (dropping below 12 resets the clock). Flagged in `store/play-console.md` item 1 as the possible longest pole in the Android launch schedule — whether it applies depends on when the user's Play Console account was created, which has not yet been checked.
- Re-verified before closing: `tsc --noEmit` clean in both `app/` and `worker/`, `expo lint` clean in `app/`, 73/73 `worker` vitest tests passing.

**Decisions:**
- 18+ Play age rating, confirmed by the user this session — diverges from Apple's 12+ deliberately; the documented rationale is that it has no compliance downside, only a smaller addressable audience on Play.
- Submit to Play without integrating the Age Signals API — a considered, documented risk acceptance (see above), not an oversight. Revisit before mid-2027 when Utah's and Louisiana's laws take effect.

**Next:**
1. **Check the Google Play Console account's creation date** — determines whether the 12-tester/14-day closed-testing requirement applies, and is now the most schedule-critical open item for Android launch (`store/play-console.md` item 1).
2. **Android — still unresolved from prior entries:** reattach a device or emulator, finish the golden-path smoke test past onboarding, and verify Android speech-to-text actually works — still the single biggest technical unknown, and increasingly the thing everything else is now waiting on.
3. Create the Play Console app entry and complete its setup declarations using `store/play-console.md`'s drafted answers (user action, needs Play Console access).
4. `npx eas build --platform android --profile production`, upload to the closed testing track — starts the tester clock if applicable, and is required before Play allows creating subscription products.
5. Play Console → Monetize: create `sb_monthly_999`/`sb_annual_4999` subscriptions; RevenueCat → add the Google Play platform (needs a Play service-account JSON) → entitlement `pro` → offering with both packages → set `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` → rebuild.
6. Real-device pass before submission: speech-to-text, the report flow against production, mic-disclosure ordering, Play paywall pricing.
7. iOS track, unchanged and still not started: buy an iPhone, confirm Apple Developer Program membership, then `eas build` + the device checklist in `app/README.md`.

**Blocked on user:**
- Confirming the Play Console account creation date (item 1 above).
- Reattaching an Android device or emulator to finish the smoke test.
- Play Console app-entry creation, subscription product creation, and RevenueCat's Google Play platform setup — all require the user's own account access.
- iPhone purchase and Apple Developer Program membership (unchanged, longstanding).

**Risks/unverified:**
- Android's golden path beyond onboarding, and Android speech-to-text specifically, remain completely unverified — unchanged from prior entries, and increasingly load-bearing since so much store-readiness work has landed around it without the app itself being confirmed to work end-to-end on the platform.
- The Age Signals API decision rests partly on a synthesis of Google's policy docs rather than a direct Google statement about the 18+ case specifically — read the community thread referenced in `store/play-console.md` before submitting.
- **The production Worker deploy and the live privacy-policy publish were real, externally-visible actions — and both were explicitly approved by Darcy in the session that performed them** (a three-way confirmation prompt covering the deploy, the 18+ rating, and GitHub Pages hosting). Both were also smoke-tested by that session: `curl` against the production `/v1/report` endpoint came back green, and the Pages URL returned HTTP 200. Still worth Darcy eyeballing the rendered privacy page once in a browser — an HTTP 200 doesn't prove the page *looks* right.

## 2026-07-13 — Play compliance P-1/P-5 implemented; Play Console prep doc written (concurrent session, verified and pushed)

**Done:**
- This entry covers work completed by a concurrent session (co-authored by Claude Opus 4.8) that landed two commits — `1cc9412` and `73ada12` — while this session was closing out. Verified independently before pushing rather than taking the commit messages on faith: `worker/` `tsc --noEmit` clean, 73/73 vitest tests passing (8 new), `app/` `tsc --noEmit` clean, `expo lint` clean.
- **P-1 (in-app report control), from `store/play-compliance.md`:** new Worker endpoint `POST /v1/report` (`worker/src/routes/report.ts`) stores a user-flagged AI reply plus the few preceding messages in the existing `RATE_LIMIT` KV namespace under `report:` keys, 90-day TTL, capped at 20 reports/device/day, no content written to logs. The app (`app/src/app/session/[id].tsx`) now shows a flag control on every AI/coach bubble in-session, with a confirm dialog that states exactly what will be sent before it's sent. Ships on both iOS and Android. Review procedure for handling incoming reports is documented in `worker/README.md`.
- **P-5 (mic prominent disclosure):** an in-app screen with an explicit accept/decline now runs before the OS `RECORD_AUDIO` permission prompt, gated through `app/src/stores/settingsStore.ts` so it only shows once.
- **`store/privacy-policy.md` updated** to disclose the new report-storage exception (90-day retention, only on user-initiated report) and to become platform-neutral (Android speech recognition, Google Play billing alongside Apple's).
- **New `store/play-console.md`** — the Play-specific counterpart to `store/metadata.md`: store listing copy, Data Safety form answers (backed by an explicit Worker-persistence audit, not guesswork), content declarations, IARC questionnaire guidance, and an ordered submission checklist. It also tracks live status of all nine `store/play-compliance.md` items (P-1 through P-9) — see table at the top of that file for what's built vs. open.
- One item flagged inside `store/play-console.md` for the user's explicit sign-off, not yet decided: it recommends filing Play's IARC questionnaire as **18+**, which diverges from the **12+** target already set for the App Store in `SPEC.md` §5.4. The doc itself flags this as "the planning model's prescribed position" needing sign-off before submission — carrying that forward here so it isn't missed.

**Decisions:**
- None made by this closing session directly — the decisions above (90-day report retention, 18+ Play rating recommendation, staying out of Play's Health-app classification) were made by the concurrent session and are recorded in `store/play-compliance.md` and `store/play-console.md`. Flagging them here because they materially extend what SPEC.md's original "no server-side conversation storage" rule (§3) meant in practice — the report feature is a deliberate, narrow, user-consented exception, not a reversal of that rule.

**Next:**
1. **Darcy sign-off needed:** the 12+ (Apple) vs 18+ (Play) age-rating divergence noted above — read `store/play-console.md`'s IARC section and confirm or override before any Play submission.
2. **Android — still unblocked from the prior entry:** get a device/emulator reattached and finish the golden-path smoke test (onboarding rendered correctly; nothing past it has been verified). Then verify Android speech-to-text actually works — still the single biggest unknown.
3. **Play Age Signals API integration (P-7)** — explicitly deferred in `store/play-console.md`, scoped for "the first Android release branch." Not yet started.
4. Remaining `store/play-console.md` submission-checklist items, most of which are the user's own account/billing actions: Google Play Console developer account ($25 one-time), publish `store/privacy-policy.md` at a public URL, tighten `ALLOWED_ORIGIN` in `worker/wrangler.toml`, RevenueCat Android/Play product setup.
5. iOS track unchanged: buy an iPhone, confirm Apple Developer Program membership, then `eas build` + device checklist.

**Blocked on user:**
- The 12+ vs 18+ age-rating sign-off above.
- Reattaching an Android device/emulator to finish the smoke test.
- Google Play Console account, RevenueCat Android setup, Apple Developer Program membership + iPhone purchase (all longstanding, unchanged).

**Risks/unverified:**
- The new `/v1/report` endpoint is covered by unit tests and a manual `wrangler dev` smoke test (per the commit message) but has not been exercised against the deployed production Worker or from a real device.
- Android's golden path beyond onboarding, and Android speech-to-text specifically, remain completely unverified (unchanged from the entry below).

## 2026-07-13 — Android emulator smoke test attempted (blocked); Play compliance doc landed; session closed out

**Done:**
- Ran the first real Android build end-to-end (`expo run:android` against a local Android Studio emulator): Gradle build succeeded (~8.5 min), the debug APK installed, Metro bundled the JS, and the app launched showing the correct onboarding value-prop screen and copy.
- Attempted the full golden-path smoke test (onboarding → consent → scenario setup → a session turn → feedback) via `adb` screenshot-and-tap automation. Got blocked immediately after launch by a recurring "System UI isn't responding" dialog from the emulator itself — confirmed across several attempts (with wait times up to 12 seconds between retries) that this is an Android System UI process issue, not an app crash: the app's own rendered content (headline/subhead copy) was correct and legible underneath the dialog every time. Could not get past onboarding as a result — the rest of the golden path is still unverified on Android.
- The user closed the emulator mid-troubleshoot; no Android device or emulator was reattached before this session closed, so the smoke test remains incomplete.
- Found that a concurrent session had, in parallel, completed the `SPEC.md` §5.7 Google Play compliance research and committed it (`bf20d88` — `store/play-compliance.md`, a 9-item work list P-1 through P-9 covering an in-app content-report control, avoiding Play's Health-app classification, the Data Safety form, a mic pre-disclosure screen, target SDK 36, age-signal gating, and the IARC questionnaire). This closes that specific "Next" item from the previous entry below — no action needed on the research itself, but none of P-1 through P-9 have been implemented yet.
- Re-verified before closing: `tsc --noEmit` clean in both `app/` and `worker/`, `expo lint` clean in `app/`, 65/65 `worker` vitest tests passing.
- Deleted six untracked debug screenshots (`scratch_screen1.png`–`scratch_screen6.png`) generated during the smoke-test attempt — throwaway diagnostic captures, not project assets.

**Decisions:**
- None new this session — this pass was build/test verification and closing out work already completed (by this session and a concurrent one), not new product or architecture decisions.

**Next:**
1. **Android — unblock the emulator smoke test.** Retry `expo run:android` with a fresh emulator boot (the ANR may be a one-off resource spike right after the first heavy Gradle build) or switch straight to the physical Android device the user has available — either is simpler than continuing to fight the same emulator instance. Once past onboarding, walk consent → scenario setup → a session turn → feedback.
2. **Android — verify speech-to-text actually works.** Still the single biggest unknown, unchanged from the prior entry — this is now load-bearing since Android ships in v1.
3. **Implement `store/play-compliance.md`'s P-1 through P-9** before any Play Store submission. The substantial one is P-1 (in-app "report this response" control + a new Worker endpoint), which the doc recommends shipping on iOS too.
4. iOS track unchanged: buy an iPhone (iOS 16.4+, iPhone 11 or newer recommended), confirm Apple Developer Program membership, then `eas build --profile development --platform ios` and the device checklist in `app/README.md`.
5. Before any store submission (either platform): tighten `ALLOWED_ORIGIN` in `worker/wrangler.toml` (still `"*"`), and publish `store/privacy-policy.md` at a public URL.
6. Decide on a paid voice provider per the prior entry's item 4 — unchanged, not urgent, since the on-device fallback ships fine without it.

**Blocked on user:**
- Reattaching an Android device or emulator to finish the smoke test — the only thing strictly blocking further Android progress right now.
- iPhone purchase and Apple Developer Program membership (unchanged, longstanding).
- RevenueCat account/project setup, needed for both platforms.
- Decision on a paid TTS provider (not required to ship v1).

**Risks/unverified:**
- Android's golden path beyond onboarding (setup → session → feedback) is still unverified end-to-end.
- Android speech-to-text is completely unverified (unchanged from the prior entry) and is now load-bearing since Android ships in v1.
- The emulator ANR's root cause is unconfirmed — plausibly a resource-contention artifact from the first heavy build, but not ruled out as anything else.
- `store/play-compliance.md`'s P-1 (in-app report control) is net-new scope, not yet built — easy to miss as "just paperwork" since most of the rest of that doc is copy/console-form work.

## 2026-07-13 — Android brought into v1 scope (committed); TTS/voice cost decisions; no code written

**Done:**
- Committed the Android scope expansion that was sitting uncommitted in the working tree (`b81f3a8`). These edits were authored by the user on 2026-07-12, not by this session — this session verified and committed them. They cover: `SPEC.md` §9 (Android removed from the binding cut list, now ships as a second v1 platform — explicitly the user's call), `SPEC.md` §5.7 (new — flags that Google Play compliance is *not researched* and blocks any Play submission), `SPEC.md` §6 (Android RevenueCat will need its own Play Console product IDs and an `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`), `CLAUDE.md` (scope-discipline rule updated to match), `app/app.json` (Android package id `com.darcy.soundingboard`), and `app/package.json` (the `android`/`ios` scripts changed from `expo start --*` to `expo run:*`, because the speech-recognition and purchases native modules require a real native build).
- Verified before committing: `tsc --noEmit` clean in `app/`, `tsc --noEmit` clean in `worker/`, and 65/65 vitest tests passing in `worker/`.
- Established the true cost picture for the app, which corrects a common wrong assumption (that the AI model is the expensive part). It is not. Per `SPEC.md` §7 and current Anthropic pricing (`claude-haiku-4-5` = $1 per million input tokens / $5 per million output tokens, already the cheapest model in the Claude lineup — Sonnet and Opus are 3–5× more): the language model costs roughly **$0.03 per 10-minute session**, while Cartesia text-to-speech costs roughly **$0.30 per session — about 10× more**. Any cost optimization should target text-to-speech, not the model.
- Confirmed by reading `worker/src/routes/tts.ts` that **text-to-speech is already optional and already has a free path**. If the `CARTESIA_API_KEY` Worker secret is unset, the `/v1/tts` endpoint returns `501 tts_unavailable` and the app falls back to the phone's built-in voice via `expo-speech` — which costs nothing. No paid voice provider is required to ship.
- Discovered from the user's untracked debug screenshots (`scratch_screen1.png` through `scratch_screen6.png`, still untracked in the repo root) that **the app already launches and renders its onboarding screen on an Android emulator** (Expo SDK 57 dev build). However, the emulator threw a `"System UI isn't responding"` dialog over the app. Unresolved — see Risks.
- Did **not** run the `SPEC.md` §10 kill-criterion persona stress test this session. It turned out to have already been run and cleared in the 2026-07-11 session (see the entry below); this session began from a stale view of the repo and only discovered that later. No action needed — the gate is passed.
- No application code was written or changed this session.

**Decisions:**
- **Do not pay for a text-to-speech provider yet; ship v1 on the free on-device voice (`expo-speech`).** *Why:* it is already wired as the fallback, it costs nothing, it carries no licensing restrictions, and text-to-speech is the single largest cost in the app (~10× the language model). Shipping without it removes a paid dependency and an account setup from the launch path. *How to apply:* simply leave the `CARTESIA_API_KEY` Worker secret unset — the Worker and app already handle this correctly. Revisit only after auditioning paid voices (see Next).
- **Keep the model as `claude-haiku-4-5`.** *Why:* the user asked whether a cheaper API exists. Haiku 4.5 is already the cheapest Claude model, and the model is not the cost driver. Switching to a weaker or different provider would also risk the persona-pushback quality that `SPEC.md` §1 calls "the entire product," and would invalidate the already-passed stress-test gate. *How to apply:* unchanged from spec — do not change the model without planning-model sign-off (`SPEC.md` §10).
- **Recorded, for whoever evaluates voice later:** the Worker's text-to-speech proxy is written specifically against Cartesia's API (`worker/src/cartesia.ts` + `worker/src/routes/tts.ts` hardcode Cartesia's endpoint, its `Authorization: Bearer` header, its request body shape, and its voice-ID format). Switching to ElevenLabs or any other provider is therefore **a rewrite of that one route, not a key swap** — a different endpoint, a different auth header (`xi-api-key` for ElevenLabs), a different body, and a different voice library. Budget real work for it, not a config change.

**Next:**
1. **Android — fix the emulator launch.** The app renders onboarding but the emulator shows `"System UI isn't responding"`. Determine whether this is an underpowered-emulator artifact (common, and often fixed by giving the emulator more RAM/CPU or enabling hardware acceleration) or a genuine app problem, then get past onboarding and through a full session.
2. **Android — verify speech-to-text actually works.** This is now the biggest Android unknown; see Risks.
3. **Research Google Play compliance** — `SPEC.md` §5.7. Play's Data Safety form, IARC content-rating questionnaire, and sensitive-app policies for an AI-conversation app. This is *blocking* for any Play Store submission and none of Apple's existing compliance work carries over.
4. **Decide on voice quality** before spending anything: audition the same persona line in the ElevenLabs playground (the user has free credits), at `play.cartesia.ai`, and against the iPhone/Android system voice. The real tradeoff is not "robotic vs. human" — modern system voices sound fine but are *emotionally flat*, and cannot make a persona sound angry, cold, or guilt-tripping. Only pay for a provider if that emotional delivery proves worth it.
5. **iOS track (unchanged, blocked on hardware):** buy an iPhone (iOS 16.4+, iPhone 11 or newer recommended), then `npx eas build --profile development --platform ios` and work through the 11-step device checklist in `app/README.md`.
6. **Before any store submission (either platform):** tighten `ALLOWED_ORIGIN` in `worker/wrangler.toml` (still `"*"`), and publish `store/privacy-policy.md` at a public URL.
7. **Housekeeping:** the six `scratch_screen*.png` files in the repo root are untracked debug screenshots from the Android emulator session. Delete them or add them to `.gitignore` — they should not be committed.

**Blocked on user:**
- Buying an iPhone for iOS device testing, and confirming Apple Developer Program membership ($99/yr) — both still outstanding from the previous session; `eas build` will fail without the latter.
- RevenueCat account and project setup (now needed for *both* platforms: an iOS key and a separate Android/Play key).
- Deciding whether a paid voice provider is wanted at all (see Next item 4). No account is needed unless the answer is yes.

**Risks/unverified:**
- **Speech-to-text on Android is completely unverified and is now load-bearing.** `SPEC.md` §2 describes `expo-speech-recognition` as wrapping iOS's `SFSpeechRecognizer`. Whether the installed version (`expo-speech-recognition@56.0.1`) supports Android at all, and how well, has never been checked. Since push-to-talk is the app's primary input method and Android is now a shipping platform, a future session must verify this early — do not assume it works.
- The Android `"System UI isn't responding"` emulator error is unexplained. It may be an emulator resource artifact rather than an app bug, but that has not been established either way.
- Google Play compliance is entirely unresearched (`SPEC.md` §5.7) — treat any assumption that Apple's rules carry over as unsafe.
- `expo-speech-recognition` still has **zero real-device verification on iOS** as well (unchanged from previous sessions) — the app has only ever run on an Android emulator.
- `app/src/lib/purchases.ts` typechecks but has never run against a real RevenueCat project (unchanged from the previous session).
- Cartesia's API shape and voice IDs in `worker/src/cartesia.ts` remain placeholders and are unverified against a live account (unchanged). Irrelevant while shipping with on-device voice.

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
