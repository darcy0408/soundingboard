# Google Play Console prep (draft)

> Companion to `store/play-compliance.md` (the policy work list, P-1…P-9). This file is what
> gets pasted into Play Console: listing copy, Data Safety answers, IARC guidance, and the
> submission checklist. Every string checked against SPEC.md §5.3's banned-words list —
> any edit must re-check. Drafted 2026-07-13.

## Status of the P-items (2026-07-13)

| Item | Status |
|---|---|
| P-1 report control | **Built** — flag on every AI reply in-session → `POST /v1/report` → KV moderation log (review steps in `worker/README.md`) |
| P-2 stay out of Health classification | **Verified** — full copy sweep found zero violations |
| P-3 AI self-identification | **Verified** in copy (consent screen, settings, crisis responses). Screenshot for the review record once running on a device |
| P-4 Data Safety form | **Answers drafted below** — Worker persistence audit confirmed the claims |
| P-5 mic prominent disclosure | **Built** — in-app disclosure with accept/decline now precedes the OS permission prompt |
| P-6 target API 36 | **Already satisfied** — Expo SDK 57 builds against target API 36 by default |
| P-7 age gating / Play Age Signals API | **18+ positioning confirmed by Darcy 2026-07-14.** Age Signals API research done 2026-07-14: **not a Play submission requirement** — see the decision under "IARC questionnaire" below |
| P-8 trial disclosure | **N/A** — no trial; paywall copy says "No trial" explicitly |
| P-9 IARC questionnaire | **Answers confirmed (18+)** — filled in Play Console at submission |

## Store listing

**App name (≤30):** `SoundingBoard` (13)
*(Same availability caveat as the App Store name — check in Play Console; fallbacks in `store/metadata.md`.)*

**Short description (≤80):**
`Rehearse hard conversations with a realistic practice partner that pushes back.` (79)

**Full description (≤4000):** reuse the App Store description from `store/metadata.md` §Description verbatim — it is already banned-words-checked and platform-neutral except the final pricing line, which is correct on Play too. Keep the SPEC §5.2 disclaimer paragraph at the end.

**Category:** Productivity. **Tags:** communication, self-improvement (avoid anything health-flavored — P-2).

**Contact email:** darcy0408@gmail.com. **Privacy policy URL (live):** `https://darcy0408.github.io/soundingboard-legal/` (published 2026-07-14 from the public `darcy0408/soundingboard-legal` repo; source of truth is `store/privacy-policy.md` here — edit there first, then mirror).

## Data Safety form answers (P-4)

Basis: Worker persistence audit 2026-07-13 — only rate-limit counters (device-ID-keyed, TTL ≤26h) plus user-initiated reports (90-day TTL) are stored; no content logging; Anthropic/Cartesia act as service providers (processing on our behalf ≠ "sharing" under Play's definitions).

| Form item | Answer |
|---|---|
| Does your app collect or share user data? | **Yes** (collect) |
| Audio (voice recordings) | **Not declared** — STT is fully on-device; audio never leaves the device (exempt) |
| Messages → Other in-app messages (conversation text) | **Collected.** Purpose: App functionality. Processed **ephemerally / in transit** (not stored) — **except** user-flagged reports, which are **stored up to 90 days** for content moderation. Not shared. Optional (user-initiated). |
| Device or other IDs | **Collected** (app-generated random ID). Purpose: Fraud prevention, security, and compliance (rate limiting, report-abuse control). Not shared. |
| Purchase history | **Collected** (subscription status via RevenueCat/Play Billing). Purpose: App functionality. Not shared. |
| Data encrypted in transit? | **Yes** (HTTPS everywhere) |
| Way to request deletion? | **Yes** — in-app "Delete all my data" wipes everything on-device; server-side data is either auto-expiring (≤26h counters) or ≤90-day reports, deletable on request via the contact email |
| Account creation | **None** — account-deletion requirements N/A (keep it that way; SPEC cut list) |

## Content declarations

- **AI-Generated Content declaration:** Yes — text chat with AI is a central feature. The in-app report mechanism (P-1) is the required mitigation; it exists on every AI reply.
- **Health apps declaration:** **Do not file** — the app has no health features and the copy sweep keeps it out of that classification (P-2). If Play Console auto-suggests the health form, decline and cite the communication-practice positioning.

## IARC questionnaire + age gating (P-7, P-9)

Per `store/play-compliance.md` P-7, the position of record is **18+ / adults-only targeting**: open-ended AI chat with no minor-specific safeguards (Character.AI precedent, state App Store Accountability Acts). Answer the IARC questionnaire honestly: realistic interpersonal conflict, infrequent mild profanity (difficulty 3), no violence/sexual content, **contains AI-generated content the user converses with**, in-app purchases yes, no user-to-user interaction, no location sharing. In "Target audience and content," select 18+ only; do not target children.

> **Confirmed by Darcy, 2026-07-14: go with 18+.** Note this diverges from the Apple track
> (12+ per SPEC §5.4) — that's expected and fine per-store, and shrinks the Play audience
> slightly rather than the reverse, so there's no compliance downside to it.

**Age Signals API — decision of record (researched 2026-07-14):** submit **without** integrating it. Google's own policy page says Play "doesn't mandate the use of these features" — it is opt-in tooling, not a submission gate. Legal landscape: only Texas's law is live (SCOTUS declined to block it 2026-07-06); Utah delayed to May 2027 and Louisiana to July 2027 by amendment. For an app accurately rated 18+, not child-directed, and requesting no age signals, the store-level age gate is Google's side of the transaction and the accurate rating is ours. Two caveats: (1) this is a synthesis from Google's docs, not a Google statement about the 18+ case specifically — there is an unresolved Play developer-community thread on exactly this ("Clarification on Play Age Signals API (beta) Requirement for 18+ Target Audience", thread 383183265) worth a manual read before submitting; (2) revisit before mid-2027 when Utah/Louisiana come into force. No official React Native/Expo wrapper exists (native Kotlin library only), so integration later means a custom or third-party native module — budget real work.

## Submission checklist (in order)

1. ~~Play Console developer account~~ — **done** (Darcy has one). ⚠️ **Check the account's creation date:** personal accounts created after 2023-11-13 must run a **closed test with ≥12 testers opted in for 14 consecutive days** before production access (current policy, verified 2026-07-14 against Google's help page; dropping below 12 resets the clock). If the account is newer than that cutoff, this is the longest pole in the schedule — start recruiting testers now.
2. ~~Privacy policy URL~~ — **done 2026-07-14:** live at `https://darcy0408.github.io/soundingboard-legal/`, wired into the in-app consent + settings links.
3. ~~Tighten `ALLOWED_ORIGIN`~~ — **done 2026-07-14**, deployed (Worker version `0fe9a346`). Also covers the iOS track.
4. ~~Age Signals decision~~ — **done:** submit without integrating (decision of record above).
5. **Darcy:** Play Console — create the app entry (name SoundingBoard, app, free-with-IAP, US-English default), complete the setup declarations using this doc's answers.
6. `npx eas build --platform android --profile production` (production AAB; needs `npx eas login` first). Upload it to the **closed testing** track — this both starts the 12-tester clock (if applicable) *and* unlocks subscription-product creation, which Play requires a billing-capable build for.
7. **Darcy:** Play Console → Monetize → create subscriptions `sb_monthly_999` ($9.99/mo) and `sb_annual_4999` ($49.99/yr); RevenueCat → add the Google Play platform (needs a Play service-account JSON per RevenueCat's docs), entitlement `pro`, offering with monthly/annual packages; then set `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` (code already selects it per-platform in `app/src/lib/purchases.ts`) and rebuild.
8. Real-device pass: STT works (biggest unknown — emulators are unreliable for speech), report flow round-trips against production, mic disclosure shows before the OS prompt, paywall loads Play prices.
9. Screenshots (phone + 7" tablet minimum), IARC questionnaire, Data Safety form (answers above), AI-content declaration, listing copy — submit for review.
