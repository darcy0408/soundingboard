# Demo video — shot script

**Hard limit: 2 minutes.** Contest rule, not a guideline; over-length risks the entry.
Record **Saturday**. Sunday is buffer only.

Budget below assumes ~150 words/minute of narration. Total script is **~295 words**, which
leaves a little air. Do not add sentences without cutting others.

---

## Before you hit record

The two slow steps will ruin a take if they happen on camera:

- [ ] **Wallet already synced**, and sync state persisted to disk. A cold sync is ~15 minutes.
- [ ] **Proof server up** — `curl localhost:6300/ready` returns OK before you start.
- [ ] **DUST balance confirmed** sufficient for one attest submission.
- [ ] **A witness file already exported** and sitting in Downloads, in case the phone leg fails.
      `midnight/contract/test/fixtures/sample-witness.json` is the documented fallback.
- [ ] App history contains **real completed rehearse sessions** — the count on screen should not
      be 1. Seven or eight looks like use; one looks like a fixture.
- [ ] Browser: **notifications off**, bookmarks bar hidden, one clean profile window.
- [ ] Phone: **do not disturb on**, screen recording ready, battery/notification bar tidy.
- [ ] Decide the identity you will show on-chain and **do not show any wallet seed on screen.**

Record the phone leg and the desktop leg separately, then cut together. Don't try for one take.

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

This is the part that's new. Practice Proof — eight sessions ready to prove.

Each completed session becomes a salted hash, derived on the phone. The transcript is never an
input to anything that leaves the device. Export gives me a witness file: my key, and eight
commitments.

Proving can't run in the app — React Native has no WebAssembly — so the phone hands off to a
browser. That turned out to be a useful boundary rather than a workaround: the device keeps the
secrets, the browser does the maths."

## 1:05–1:45 — The proof and the chain (~100 words)

> *Visual: dApp → load witness → connect wallet → prove → submit → block explorer / indexer.*

"The dApp loads that file, connects my wallet, and generates a zero-knowledge proof against a
local proof server.

The circuit checks four things: the claim is in range, no slot is empty, all eight commitments
are distinct, and the number goes up — so an old proof can't be replayed downward.

Submitted to Midnight Preview. And here it is on-chain.

That's the whole public record. One identity hash, one number. Anyone can read it and verify the
milestone — no special tooling, it's just a public map."

## 1:45–2:00 — What's public, what isn't (~38 words)

> *Visual: side-by-side — the on-chain entry vs. the phone.*

"On-chain: a hash, and the number eight.

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
- If the proof takes more than a few seconds, **cut or speed-ramp** — do not film a spinner.
- If the on-chain leg fails on the day, the honest fallback is to show the 31 passing contract
  tests and say the deploy is pending. A real limitation stated plainly beats a staged success.
