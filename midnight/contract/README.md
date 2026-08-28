# Practice Proof — the Compact contract

Built during the MLH Midnight Hackathon (Aug 28–30 2026). Nothing in this
directory existed before the event.

Proves that a SoundingBoard user has completed at least N rehearsal sessions,
without revealing the sessions.

## What is public, and what is not

The contract's entire public footprint is one map entry:

```
milestones[identity] = claimed
```

| | |
|---|---|
| **On-chain** | a 32-byte identity hash, and a small integer (1–10) |
| **Never leaves the device** | the secret key, every session commitment, and therefore every transcript, score, scenario, timestamp and session id behind them |

The identity is `persistentHash("soundingboard:practiceproof:v1", secretKey)`.
It is not the user's wallet key, so an attestation is not linkable to their
wallet, and the domain separator stops the same secret being replayed into
another contract.

Verification needs no special circuit: the map is public, so any third party
reads `milestones` off the indexer and checks the number.

## Circuit

`attest(claimed: Uint<8>)` enforces four things:

1. `1 <= claimed <= MAX_SESSIONS`
2. no claimed slot is empty — padding cannot be counted as a session
3. the first `claimed` commitments are pairwise distinct
4. `claimed` strictly exceeds the identity's recorded milestone (monotonic, so
   an old proof cannot be replayed to downgrade a record)

Because the witness vector is fixed-width and Compact loops are fully unrolled,
a mask (`index < claimed`) is what lets one circuit serve every claim from 1 to
10 rather than needing a separate circuit per milestone. Slots at or beyond
`claimed` are ignored entirely.

## Capacity: why MAX_SESSIONS = 10

The distinctness check is pairwise, so the circuit grows quadratically.
Measured on this machine (compiler 0.31.1, `--skip-zk`, instruction counts from
the generated `attest.zkir`):

| MAX_SESSIONS | pairs compared | zkir instructions |
|---|---|---|
| 10 | 45 | 430 |
| 25 | 300 | 2,045 |
| 50 | 1,225 | 7,743 |

That is ≈6.3 instructions per comparison over ~145 fixed overhead — clean
quadratic growth, and cheap in absolute terms. Full compilation including PLONK
key generation takes **7.4 s** at MAX=10.

So 25 would be affordable. 10 is chosen because the demo is stronger exporting
*real* practice history than padding a mostly-empty 25-slot vector, and because
"complete 10 practice sessions" is what an assigning therapist or coach actually
says. Raising it means changing the three constants marked in
`src/practice_attestation.compact` and `MAX_SESSIONS` in `src/witnesses.ts`.

### Sorted input would be slower, not faster

The obvious optimisation is to require the prover to supply commitments in
ascending order, which makes distinctness O(N) instead of O(N²). **Don't.**
Ordering comparisons on `Bytes<32>` are not native in Compact — they require
unpacking to `Vector<32, Uint<8>>` and converting to U256 (see OpenZeppelin's
`Bytes32` module, whose `pack` helper alone is annotated `k=14, rows=10231`).
Equality is native and cheap. The quadratic version of the cheap operation
comfortably beats the linear version of the expensive one at these sizes.

## Witness format

This is the contract for Phase 2 (the attest dApp) and Phase 3 (the app-side
export). Both witnesses are implemented in `src/witnesses.ts`.

```ts
type PracticePrivateState = {
  secretKey: Uint8Array;      // 32 bytes, device-local, generated once
  commitments: Uint8Array[];  // exactly 10 entries of 32 bytes
};
```

Real commitments come first; the tail is zero-filled by `padCommitments()`.
`claimed` must never exceed the number of real commitments — the circuit
rejects it if it does, because the zero commitment is not a valid session.

## Build and test

Everything runs from WSL, per `midnight/README.md`.

```bash
source ~/mnenv.sh
cd midnight/contract
npm install
npm run build        # full compile incl. ZK keys (~7 s)
npm test             # 31 tests
npm run typecheck    # requires a build first
```

`npm run build:fast` adds `--skip-zk` for quick syntax iteration; it skips key
generation, so use the full build before trusting anything about proving.

**Never run bare `compact update`.** It installs 0.34.0, which targets ledger 9
while Preview runs ledger 8 — contracts built on it compile cleanly and then
fail on-chain. Both build scripts pin `+0.31.1` explicitly.

`practice_attestation.test.ts` covers the circuit: the happy path, both claim
bounds, padding rejection, the mask boundary from both sides (a duplicate at the
boundary is ignored at `claimed=3` and caught at `claimed=4`), monotonicity in
all three directions, identity isolation between users, and the privacy
invariants — that no commitment ever reaches the ledger, and that two users with
identical practice history still get distinct on-chain identities.

`witness-file.test.ts` covers the **file format** that crosses process
boundaries: app (React Native) → exported JSON → attest dApp (browser) → this
circuit. Nothing type-checks across that seam, so the suite runs a
representative export straight through the real contract.
`test/fixtures/sample-witness.json` is generated with the exact derivation in
`app/src/lib/practiceProof.ts`, so it is what the app actually emits rather than
hand-written hex — and it doubles as the standalone demo input if the mobile
export is ever unavailable.

## Honest limitation

Commitments are generated on-device from a self-chosen salt. The circuit proves
they are **distinct**; it cannot prove they correspond to real practice
sessions. A determined user could fabricate ten values and attest to a milestone
they did not earn.

The fix, deliberately out of scope this weekend: have the SoundingBoard Worker
issue a blind signed receipt on each completed `POST /v1/feedback`, and have the
circuit verify those signatures instead of merely checking distinctness. That
gives real unforgeability while the server still learns nothing about the
conversation — it signs a blinded commitment and never sees what it signed.

What already holds today is the part that is hard to retrofit: the privacy
architecture. Adding countersigning would not change the on-chain footprint by
a single byte — still one identity, one number.
