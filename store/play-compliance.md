# Google Play compliance — scoping doc (SPEC §5.7)

**Date:** 2026-07-13 · **Status:** research complete, scoped — items P-1…P-9 below are the Play-side work list
**Owner of record:** planning model (Fable). Implementing agents: treat the item list as the spec; policy citations are for verification, don't re-research.

This closes the SPEC §5.7 "Google Play compliance research not yet done" flag. Sources are Google's developer-policy pages as of 2026-07-13; each item cites its policy.

---

## The one net-new feature

**P-1. In-app "report this response" control (REQUIRED, blocks Play submission).**
Play's AI-Generated Content policy explicitly covers "text-to-text AI chatbot apps in which the AI generated chatbot interaction is a central feature" — that is SoundingBoard. It requires an **in-app mechanism to report/flag offensive AI content without leaving the app**, and the reports must feed moderation. We have nothing like this today.
Scope: a small flag icon on persona/coach messages → POST to a new Worker endpoint (`/v1/report`, KV- or R2-backed log with conversation-turn context the user consents to send) → periodic human review. Ship it on iOS too (parity is nearly free, and Apple reviewers like it).
*Policy: support.google.com/googleplay/android-developer/answer/14094294*

## Positioning guardrails (copy, not code)

**P-2. Stay out of Play's "Health apps" classification.**
The Health Content & Services policy triggers on "health-related features or information," which would require the Health apps declaration form — and health-classified apps now require a **verified Organization Account** (individual accounts don't qualify; deadline already passed in Jan 2026). SoundingBoard is an individual-account app, so being health-classified is not just paperwork — it could block distribution.
Scope: sweep ALL Play listing copy + in-app copy for therapy/mental-health/anxiety/wellness framing. The app is "conversation practice" and "communication skills," never "mental health support," "therapy," "anxiety relief." Same discipline as PureFork's converter-not-generator rule: the category words are load-bearing. The vent mode is "clear your head before a hard conversation," not emotional treatment.
*Policy: support.google.com/googleplay/android-developer/answer/16679511*

**P-3. AI self-identification.** The persona must be unambiguous that it's an AI (NY's companion-AI law S-3008C requires non-human self-identification and crisis protocols; more states are following). We already have the crisis pre-filter + hotline redirect in the Worker — keep it, and verify onboarding/session UI states plainly that the persona is AI. Cheap; mostly already true via the AI-consent onboarding screen — verify and screenshot for the review record.

## Data safety form (declarations, not code)

**P-4. Form answers, per policy:**
- **On-device STT audio: NOT declared.** Data "processed entirely on-device and never sent off device" is exempt. Our STT is on-device (`expo-speech-recognition`); only the transcript text leaves. Keep it that way — this exemption is an architecture asset.
- **Conversation text: DECLARED as collected** (sent to Cloudflare Worker → Anthropic). Purpose: app functionality. Not shared for ads. Mark as processed ephemerally/in transit if we continue not storing transcripts server-side — verify the Worker truly persists nothing beyond rate-limit keys before answering the form.
- **RevenueCat purchase data: DECLARED.** The payment-processor exemption only applies if the app never accesses the data; our app receives entitlement/subscriber info from RevenueCat, so it must be declared.
- **Account deletion requirement: N/A** — the app is account-less, and Play's requirement applies only to apps that allow account creation. Preserve account-less design through v1; adding accounts later adds this obligation.
*Policy: support.google.com/googleplay/android-developer/answer/10787469 ; …/13327111*

## Small code/config items

**P-5. Mic prominent-disclosure screen.** Before the first RECORD_AUDIO permission prompt, show an in-app disclosure (why the mic is needed: "to transcribe your side of the rehearsal on this device"), requiring affirmative accept with a visible decline path. Store-listing text does not count; it must be in-app, immediately pre-prompt. 30-day removal risk for noncompliance.
*Policy: support.google.com/googleplay/android-developer/answer/11150561*

**P-6. Target API level: build against API 36.** Current floor for new apps is API 35; from 2026-08-31 new submissions need API 36 (extension window to Nov 1). Since our Play submission will land near that boundary, target 36 now and skip the migration.
*Policy: developer.android.com/google/play/requirements/target-sdk*

**P-7. Age gating + Play Age Signals API.** App Store Accountability Acts (TX in effect; UT since 2026-05-06; LA since 2026-07-01) require developers to consume Google's Play Age Signals API for age-range/parental-consent signals in those states. Given the Character.AI precedent (open-ended AI chat killed for under-18s after litigation), the clean position for a v1 with no minor-specific safeguards: **18+ IARC rating and treat any "minor" age signal as a hard block**. Scope the Age Signals API call into the Android build.
*Policy: support.google.com/googleplay/android-developer/answer/16569691*

**P-8. Paywall trial disclosure.** If we offer a free trial, the post-trial auto-recurring price must be clearly legible at signup — audit the paywall screen copy against this before submission.
*Policy: support.google.com/googleplay/android-developer/answer/9900533*

**P-9. IARC questionnaire.** Standard, one pass in Play Console; answer as an 18+ social/communication app, consistent with P-7. Unrated apps get pulled.
*Policy: support.google.com/googleplay/android-developer/answer/9898843*

## What this does NOT change
- iOS/App Store track: unaffected, still blocked on hardware + Apple Developer membership.
- Crisis pre-filter, `ALLOWED_ORIGIN` tightening, privacy-policy publishing: already tracked in SESSION_NOTES/SPEC — unchanged, though P-4's "verify the Worker stores nothing" check overlaps the privacy-policy wording.

## Suggested sequencing
P-1 (report endpoint + UI) is the only real feature — one implementing-agent ticket. P-2/P-3 are copy sweeps. P-4/P-8/P-9 are console-form prep. P-5/P-6/P-7 are small Android-build items that can ride the first Android release branch. None of it blocks current iOS work.
