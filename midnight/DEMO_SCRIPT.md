# Demo video — shot script

**Hard limit: 2 minutes.** Contest rule, not a guideline; over-length risks the entry.
Record **Saturday**. Sunday is buffer only.

Budget below assumes ~150 words/minute of narration. Total script is **~295 words**, which
leaves a little air. Do not add sentences without cutting others.

---

## Before you hit record

The two slow steps will ruin a take if they happen on camera:

- [ ] **Run the pre-flight** — `npm run preflight -w sb-phase0-smoke` (from WSL). One command
      covers the next four things: it checks the proof server, syncs the wallet and refreshes the
      snapshot so the take never films a ~13 min cold sync, prints the DUST balance, and reads the
      contract's ledger back through the indexer. It prints `READY` or the list of problems.
      It deliberately does **not** submit: `attest` requires a claim strictly greater than the
      recorded milestone, so a warm-up submission would eat the headroom the demo needs to show
      the number going up.
- [ ] **A witness file already exported** and sitting in Downloads, in case the phone leg fails.
      `midnight/contract/test/fixtures/sample-witness.json` is the documented fallback.
- [ ] App history contains **real completed rehearse sessions** — the count on screen should not
      be 1. The sample witness holds seven real commitments, so seven is the number the narration says; one looks like a fixture.
- [ ] Browser: **notifications off**, bookmarks bar hidden, one clean profile window.
- [ ] Phone: **do not disturb on**, screen recording ready, battery/notification bar tidy.
- [ ] Decide the identity you will show on-chain and **do not show any wallet seed on screen.**

Record the phone leg and the desktop leg separately, then cut together. Don't try for one take.

**Claim 7 on camera.** The chain records milestone 3 and `attest` only accepts a strictly higher
number, so anything ≤ 3 is rejected by the circuit. The sample witness carries seven real
commitments, so 7 is both valid and visibly an increase:

```bash
SB_CLAIMED=7 npm run attest -w sb-phase0-smoke
```

**A scrolling teleprompter of this script** lives at `~/Desktop/soundingboard-teleprompter.html`
(open in Chrome). It splits the two legs into timed acts — 60 s phone, 54 s desktop — with a
countdown, a running clock, and an automatic stop between them so the two clips can be joined end
to end without overlay editing. It carries the same narration as the beats below; edit both or
neither.

---

## 0:00–0:20 — The problem (~50 words)

> *Visual: app open on a rehearse session, mid-conversation.*

"SoundingBoard lets you rehearse a difficult conversation out loud with an AI that pushes back,
then scores how you did. Everything stays on the phone — transcripts, scores, all of it.

Which is exactly right, until someone needs proof you did the work. Private, or provable. Until
now you had to pick one."

## 0:20–1:05 — The app and the export (~110 words)

> *Visual: end a session → feedback report → Settings → Practice Proof → count → Export.*

"Here's a finished session. Clarity, composure, assertiveness, with the moments quoted back.

This is the part that's new. Practice Proof — seven sessions ready to prove.

Each completed session becomes a salted hash, derived on the phone. The transcript is never an
input to anything that leaves the device. Export gives me a witness file: my key, and seven
commitments.

Proving can't run in the app — React Native has no WebAssembly — so the phone hands off to a
browser. That turned out to be a useful boundary rather than a workaround: the device keeps the
secrets, the browser does the maths."

## 1:05–1:45 — The proof and the chain (~100 words)

> *Visual, in three beats — do NOT try to do this through the wallet extension on camera:*
> 1. *dApp → load the witness file → the "stays on your device / becomes public" split.*
> 2. *terminal → `npm run attest -w sb-phase0-smoke` → proving time, then the tx.*
> 3. *back to the dApp → refresh → the new row appears in the public record.*

"The dApp loads that file and shows me exactly what it's about to disclose, and what it isn't.

The proof runs against a local proof server — the witness values never go to anyone else's
machine. The circuit checks four things: the claim is in range, no slot is empty, the
commitments are distinct, and the number goes up, so an old proof can't be replayed downward.

Submitted to Midnight Preview. Now watch — I reload the page, and there it is.

That read needs no wallet and no permission from me. It's a public map. That's what makes it a
receipt rather than a claim."

## 1:45–2:00 — What's public, what isn't (~38 words)

> *Visual: side-by-side — the on-chain entry vs. the phone.*

"On-chain: a hash, and the number seven.

Still on the phone: every transcript, every score, who each conversation was with, and whether
any particular session ever happened.

Proof of the work. Not the diary."

---

## Notes

- **Say "Preview", never "testnet".** Midnight's dev network is Preview; the token is NIGHT and
  DUST. A Midnight judge will notice.
- Narration says "a coach or a program that assigned the practice" rather than naming a clinical
  role — SoundingBoard is positioned as communication practice, never therapy, and that line is
  load-bearing across the whole project. Keep the video consistent with it.
- Proving is measured at **2.7 s** (block 632945). That is short enough to film live — no need to
  cut or speed-ramp the proof itself. The ~20 s that follows is balancing and finalization; cut
  that.
- If the on-chain leg fails on the day, the honest fallback is to show the 52 passing contract
  tests plus the already-deployed contract, and say the submission is pending. A real limitation
  stated plainly beats a staged success.
- **Do not demo the browser Connect-wallet button.** Submission through the Lace extension is
  written but has never been run end to end — Lace was still on mainnet when this was built. The
  headless `attest` script is the proven path, and the three-beat cut above uses it.
