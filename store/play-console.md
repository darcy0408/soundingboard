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
| P-7 age gating / Play Age Signals API | **Open — deferred code item**, see below |
| P-8 trial disclosure | **N/A** — no trial; paywall copy says "No trial" explicitly |
| P-9 IARC questionnaire | **Guidance drafted below** — filled in Play Console at submission |

## Store listing

**App name (≤30):** `SoundingBoard` (13)
*(Same availability caveat as the App Store name — check in Play Console; fallbacks in `store/metadata.md`.)*

**Short description (≤80):**
`Rehearse hard conversations with a realistic practice partner that pushes back.` (79)

**Full description (≤4000):** reuse the App Store description from `store/metadata.md` §Description verbatim — it is already banned-words-checked and platform-neutral except the final pricing line, which is correct on Play too. Keep the SPEC §5.2 disclaimer paragraph at the end.

**Category:** Productivity. **Tags:** communication, self-improvement (avoid anything health-flavored — P-2).

**Contact email:** darcy0408@gmail.com. **Privacy policy URL:** publish `store/privacy-policy.md` first (required field — see checklist).

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

> ⚠️ Note the divergence from the Apple track (12+ per SPEC §5.4). Per-store divergence is
> legitimate, but it halves nothing on iOS while shrinking the Play audience — this is the
> planning model's prescribed position, **flag to Darcy for explicit sign-off before submission**.

**Deferred code item:** the Play Age Signals API integration (TX/UT/LA laws) is scoped for the first Android release branch — consume the age-range signal and hard-block "minor" signals. Not yet implemented; do not submit to Play before either integrating it or confirming current enforcement scope makes it non-blocking at submission time.

## Submission checklist (in order)

1. **Darcy:** Google Play Console developer account ($25 one-time), identity verification (individual account is fine — we are staying out of the health classification that would demand an Organization Account).
2. **Darcy:** publish `store/privacy-policy.md` at a public URL (GitHub Pages works); paste the URL in Play Console *and* the in-app consent screen link.
3. Tighten `ALLOWED_ORIGIN` in `worker/wrangler.toml` (shared with the iOS track).
4. **Darcy:** RevenueCat — create the Play (Android) project half: Play Console subscription products mirroring `sb_monthly_999`/`sb_annual_4999`, entitlement `pro`, then set `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` (pattern in `app/src/lib/purchases.ts` / `app/README.md`).
5. Age Signals API integration (P-7 above) or a documented decision that it's non-blocking.
6. `npx eas build --platform android` (production AAB), signed by EAS-managed credentials.
7. Real-device pass: STT works (biggest unknown — emulators are unreliable for speech), report flow round-trips, mic disclosure shows before the OS prompt, paywall loads Play prices.
8. Screenshots (phone + 7" tablet minimum), IARC questionnaire, Data Safety form (answers above), AI-content declaration, listing copy — submit for review.
