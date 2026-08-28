# SoundingBoard

**Practice difficult conversations with an AI persona that actually pushes back.**

Most conversational AI collapses into agreeableness — it tells you what you want to hear, which is useless for rehearsing a hard talk. SoundingBoard is built around the opposite: a persona that stays in character, holds its position, and makes you work for it. Then it scores how you did.

SoundingBoard is communication-skills practice. It is not therapy, counseling, or mental-health treatment, and it makes no medical claims.

> **MLH Midnight Hackathon (Aug 28–30 2026):** this weekend added **Practice Proof** — a zero-knowledge attestation that you completed N rehearsal sessions, without revealing any of them. Jump to [Practice Proof](#practice-proof--zero-knowledge-attestation). Everything built during the event lives in [`midnight/`](midnight/) plus two files in the app; the split is disclosed in full [below](#what-existed-before-the-hackathon).

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

---

## Practice Proof — zero-knowledge attestation

The privacy design above has a blind spot.

Keeping every transcript on the phone is the right default, right up until someone needs **proof**. A therapist assigning communication homework, a coach, an employer with a training requirement, a court-ordered program — the moment you want credit for the practice, the only evidence you can offer is the diary itself.

Private, or provable: pick one.

**Practice Proof removes the choice.** It proves you completed at least N rehearsal sessions and reveals nothing about any of them.

### What is public, and what is not

The contract's entire on-chain footprint is one map entry — `milestones[identity] = claimed`:

| | |
|---|---|
| **Public, on Midnight** | a 32-byte identity hash, and a small integer (1–10) |
| **Never leaves the device** | every transcript, score, scenario, timestamp and session id — and the fact that any particular session happened at all |

The identity is `persistentHash("soundingboard:practiceproof:v1", secretKey)`. It is not the user's wallet key, so an attestation is not linkable to their wallet, and the domain separator stops the same secret being replayed into a different contract.

Verification needs no special tooling: the map is public, so any third party reads `milestones` off the indexer and checks the number.

### Architecture

```
 ┌──────────────────────────────────┐
 │  SoundingBoard app  (device)     │   transcripts, scores, scenarios:
 │                                  │   never leave this box
 │  practiceProof.ts                │
 │    commitment = sha256(          │
 │      domain : salt : id : time)  │
 │    witness JSON  ────────────────┼──▶ share sheet
 └──────────────────────────────────┘        │
                                             ▼
                           ┌──────────────────────────────┐
                           │  attest dApp  (browser)      │
                           │  wallet → witness → proof    │
                           └──────────────┬───────────────┘
                                          │ local proof server :6300
                                          ▼
                           ┌──────────────────────────────┐
                           │ practice_attestation.compact │
                           │   milestones[id] = claimed   │
                           └──────────────────────────────┘
                                  Midnight Preview
```

Proving happens in a browser rather than in the app because React Native's JS engine has no WebAssembly. The split turns out to be less a workaround than a boundary: the device holds the secrets and emits a witness, the browser does the maths.

### The circuit

`attest(claimed: Uint<8>)` enforces four things:

1. `1 <= claimed <= 10`
2. no claimed slot is empty — padding cannot be counted as a session
3. the first `claimed` commitments are pairwise distinct
4. `claimed` strictly exceeds the identity's recorded milestone, so an old proof cannot be replayed to downgrade a record

Because Compact loops fully unroll and the witness vector is fixed-width, a mask (`index < claimed`) is what lets **one** circuit serve every milestone from 1 to 10 rather than needing a separate circuit per milestone.

Full design notes — including why sorted input would be *slower* than the quadratic distinctness check, and the measured cost of raising the session cap — are in [`midnight/contract/README.md`](midnight/contract/README.md).

### Build and run it

The Compact toolchain runs under WSL or Linux. Versions are pinned deliberately: **never run bare `compact update`** — it installs 0.34.0, which targets ledger 9, while Preview runs ledger 8, so contracts built on it compile cleanly and then fail on-chain.

```bash
cd midnight/contract
npm install
npm run build      # compiler 0.31.1, incl. PLONK key generation (~7 s)
npm test           # 31 tests
```

The suite covers the circuit (claim bounds, padding rejection, the mask boundary from both sides, monotonicity, identity isolation, and the privacy invariants) and the **witness file format** that crosses the app → dApp → circuit seam, where nothing type-checks. `midnight/contract/test/fixtures/sample-witness.json` is generated with the exact derivation in `app/src/lib/practiceProof.ts`, so it is what the app really emits rather than hand-written hex — and it doubles as a standalone demo input.

App side: `app/src/lib/practiceProof.ts` derives the commitments; Settings → Practice Proof shows the claimable count and exports the witness.

<!-- TODO(phase-2): attest dApp build/run steps, and the deployed Preview contract address. -->

### Honest limitations

**Commitments are generated on-device.** The circuit proves they are *distinct*; it cannot prove they correspond to real practice sessions. A determined user could fabricate ten values and attest to a milestone they did not earn.

The fix — deliberately out of scope for a weekend — is for the Worker to issue a blind signed receipt on each completed feedback call, and for the circuit to verify those signatures instead of merely checking distinctness. That gives real unforgeability while the server still learns nothing about the conversation: it signs a blinded commitment and never sees what it signed.

What already holds today is the part that is hard to retrofit: the privacy architecture. Adding countersigning would not change the on-chain footprint by a single byte — still one identity, one number.

**The export path has not been run on a physical device.** It is verified by type-checking and by its output passing through the real contract, not by a device run.

### What existed before the hackathon

Per the Integrate track rules, the honest split.

**Before the event** — the entire SoundingBoard app and Cloudflare Worker, public in this repo as of commit `dd2ca6a` (2026-07-27), at which point the project was parked: rehearse and vent modes, the persona system, push-to-talk with on-device speech recognition, the feedback scoring pipeline, local history storage, and 73 passing Worker tests. None of it had anything to do with Midnight or blockchain.

**During the event**, all on the `midnight-hackathon` branch: everything under `midnight/` (the Compact contract, its tests, and the attest dApp), plus `app/src/lib/practiceProof.ts`, `app/src/app/practice-proof.tsx`, the Settings entry point that reaches them, and this documentation. The Worker is untouched.

---

## Status

Active for the MLH Midnight Hackathon (Aug 28–30 2026), on the `midnight-hackathon` branch.

The underlying app was **parked** before the event — feature-complete as a working prototype, store submission not pursued, published as a reference implementation rather than a shipping product:

- Both modes implemented end to end against a **production-deployed Worker**
- 73 Worker tests passing; `tsc --noEmit` and `expo lint` clean across app and worker
- Store-compliance work landed: published privacy policy, mic prominent-disclosure, report-AI-response control, CORS locked down
- Android and iOS store submissions not completed

The parts most likely to be useful to someone else: the Compact contract in `midnight/contract/`, the Worker-as-credential-boundary pattern in `worker/`, the on-device speech recognition setup, and the App Store positioning analysis in `SPEC.md`.

## Layout

```
app/       Expo / React Native client
worker/    Cloudflare Worker — API proxy, prompt assembly, rate limiting, crisis routing
prompts/   Persona, vent-coach, and feedback prompts
midnight/  Practice Proof — Compact contract, tests, attest dApp
store/     Store listing, privacy policy, compliance research
SPEC.md    Authoritative build spec
```

## A note on positioning

The "communication practice, never therapy" line in this README is deliberate and load-bearing, not marketing hedging. Apps in this space that positioned themselves as mental-health tools ran into App Store guideline 1.4.1; ones that positioned as companions landed in the 18+ bucket. The scope, the copy, and the crisis-routing behavior in `worker/src/crisis.ts` all follow from that decision. See `SPEC.md` for the full rationale.
