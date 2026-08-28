// Practice Proof — circuit behaviour tests.
//
// Every `assert` in practice_attestation.compact has at least one test that
// makes it fire, plus the boundary case on either side of the claim mask.
// The mask is the subtle part of this contract: slots at or beyond `claimed`
// must be ignored, and slots below it must not be.

import { describe, it, expect, beforeEach } from "vitest";
import {
  PracticeSim,
  actor,
  bytes32,
  commitmentSet,
  toHex,
  MAX_SESSIONS,
} from "./simulator.js";

const ALICE = 0xa1;
const BOB = 0xb2;

describe("attest — happy path", () => {
  let sim: PracticeSim;
  let alice: ReturnType<typeof actor>;

  beforeEach(() => {
    alice = actor(ALICE, MAX_SESSIONS);
    sim = new PracticeSim(alice);
  });

  it("records a full-capacity milestone", () => {
    sim.as(alice).attest(MAX_SESSIONS);
    const entries = sim.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0][1]).toBe(BigInt(MAX_SESSIONS));
  });

  it("records a partial milestone below capacity", () => {
    sim.as(alice).attest(3);
    expect(sim.entries()[0][1]).toBe(3n);
  });

  it("accepts a claim of exactly 1", () => {
    sim.as(alice).attest(1);
    expect(sim.entries()[0][1]).toBe(1n);
  });
});

describe("attest — claim bounds", () => {
  let sim: PracticeSim;
  let alice: ReturnType<typeof actor>;

  beforeEach(() => {
    alice = actor(ALICE, MAX_SESSIONS);
    sim = new PracticeSim(alice);
  });

  it("rejects a zero claim", () => {
    expect(() => sim.as(alice).attest(0)).toThrow(
      "must claim at least one session",
    );
  });

  it("rejects a claim above MAX_SESSIONS", () => {
    expect(() => sim.as(alice).attest(MAX_SESSIONS + 1)).toThrow(
      "claim exceeds MAX_SESSIONS",
    );
  });
});

describe("attest — padding cannot be counted", () => {
  // Alice has only 3 real sessions; slots 3..9 are zero padding.
  let sim: PracticeSim;
  let alice: ReturnType<typeof actor>;

  beforeEach(() => {
    alice = actor(ALICE, 3);
    sim = new PracticeSim(alice);
  });

  it("allows claiming exactly the real sessions, ignoring the padding", () => {
    sim.as(alice).attest(3);
    expect(sim.entries()[0][1]).toBe(3n);
  });

  it("rejects claiming one padding slot", () => {
    // This is the off-by-one that pairwise distinctness alone would miss:
    // a single padding slot is distinct from every real commitment.
    expect(() => sim.as(alice).attest(4)).toThrow(
      "claimed more sessions than commitments supplied",
    );
  });

  it("rejects claiming several padding slots", () => {
    expect(() => sim.as(alice).attest(6)).toThrow(
      "claimed more sessions than commitments supplied",
    );
  });
});

describe("attest — distinctness", () => {
  it("rejects a duplicate inside the claimed prefix", () => {
    const alice = actor(ALICE, MAX_SESSIONS);
    alice.commitments[1] = bytes32(1); // same as commitments[0]
    const sim = new PracticeSim(alice);
    expect(() => sim.as(alice).attest(2)).toThrow(
      "duplicate session commitment",
    );
  });

  it("rejects a duplicate spanning non-adjacent slots", () => {
    const alice = actor(ALICE, MAX_SESSIONS);
    alice.commitments[7] = bytes32(1); // same as commitments[0]
    const sim = new PracticeSim(alice);
    expect(() => sim.as(alice).attest(MAX_SESSIONS)).toThrow(
      "duplicate session commitment",
    );
  });

  // The mask boundary, tested from both sides with the SAME witness.
  describe("claim mask boundary", () => {
    // commitments[3] is made a duplicate of commitments[2].
    const withDuplicateAt3 = () => {
      const a = actor(ALICE, MAX_SESSIONS);
      a.commitments[3] = bytes32(3); // same as commitments[2]
      return a;
    };

    it("ignores a duplicate that sits exactly at the claim boundary", () => {
      const alice = withDuplicateAt3();
      const sim = new PracticeSim(alice);
      // claimed=3 covers slots 0,1,2 — slot 3 is outside and must be ignored.
      sim.as(alice).attest(3);
      expect(sim.entries()[0][1]).toBe(3n);
    });

    it("catches the same duplicate once the claim includes it", () => {
      const alice = withDuplicateAt3();
      const sim = new PracticeSim(alice);
      // claimed=4 pulls slot 3 inside the mask.
      expect(() => sim.as(alice).attest(4)).toThrow(
        "duplicate session commitment",
      );
    });
  });
});

describe("attest — monotonicity", () => {
  let sim: PracticeSim;
  let alice: ReturnType<typeof actor>;

  beforeEach(() => {
    alice = actor(ALICE, MAX_SESSIONS);
    sim = new PracticeSim(alice);
    sim.as(alice).attest(5);
  });

  it("allows raising the milestone", () => {
    sim.as(alice).attest(7);
    expect(sim.entries()[0][1]).toBe(7n);
  });

  it("rejects lowering the milestone (replay-downgrade)", () => {
    expect(() => sim.as(alice).attest(3)).toThrow(
      "milestone must strictly increase",
    );
  });

  it("rejects re-attesting the same milestone", () => {
    expect(() => sim.as(alice).attest(5)).toThrow(
      "milestone must strictly increase",
    );
  });

  it("leaves the milestone unchanged after a rejected downgrade", () => {
    expect(() => sim.as(alice).attest(3)).toThrow();
    expect(sim.entries()[0][1]).toBe(5n);
  });
});

describe("attest — identity isolation", () => {
  it("keeps two users' milestones independent", () => {
    const alice = actor(ALICE, MAX_SESSIONS);
    const bob = actor(BOB, MAX_SESSIONS);
    const sim = new PracticeSim(alice);

    sim.as(alice).attest(4);
    sim.as(bob).attest(9);

    const byMilestone = Object.fromEntries(
      sim.entries().map(([k, v]) => [v.toString(), k]),
    );
    expect(sim.ledger().milestones.size()).toBe(2n);
    expect(Object.keys(byMilestone).sort()).toEqual(["4", "9"]);
    // Two different secrets must produce two different on-chain identities.
    expect(byMilestone["4"]).not.toEqual(byMilestone["9"]);
  });

  it("does not let one user's attestation satisfy another's monotonicity", () => {
    const alice = actor(ALICE, MAX_SESSIONS);
    const bob = actor(BOB, MAX_SESSIONS);
    const sim = new PracticeSim(alice);

    sim.as(alice).attest(8);
    // Bob starts from zero regardless of Alice's high milestone.
    sim.as(bob).attest(1);
    expect(sim.ledger().milestones.size()).toBe(2n);
  });

  it("derives the same identity from the same secret across calls", () => {
    const alice = actor(ALICE, MAX_SESSIONS);
    const sim = new PracticeSim(alice);
    sim.as(alice).attest(2);
    const firstKey = sim.entries()[0][0];
    sim.as(alice).attest(6);
    expect(sim.entries()).toHaveLength(1);
    expect(sim.entries()[0][0]).toBe(firstKey);
  });
});

describe("privacy invariant — what reaches the public ledger", () => {
  it("publishes only an identity hash and a small integer", () => {
    const alice = actor(ALICE, MAX_SESSIONS);
    const sim = new PracticeSim(alice);
    sim.as(alice).attest(MAX_SESSIONS);

    const [[key, value]] = sim.entries();
    // The identity is a 32-byte hash...
    expect(key).toHaveLength(64);
    // ...and it is NOT the raw secret.
    expect(key).not.toBe(toHex(alice.secretKey));
    // The milestone is just the claimed count.
    expect(value).toBe(BigInt(MAX_SESSIONS));
  });

  it("never writes any session commitment on-chain", () => {
    const alice = actor(ALICE, MAX_SESSIONS);
    const sim = new PracticeSim(alice);
    sim.as(alice).attest(MAX_SESSIONS);

    const published = sim.entries().map(([k]) => k);
    for (const c of commitmentSet(MAX_SESSIONS)) {
      expect(published).not.toContain(toHex(c));
    }
  });

  it("reveals nothing distinguishing two users with identical practice", () => {
    // Same commitments, different secrets — the on-chain keys must differ,
    // proving the identity is not a function of the practice data.
    const a = { secretKey: bytes32(ALICE), commitments: commitmentSet(MAX_SESSIONS) };
    const b = { secretKey: bytes32(BOB), commitments: commitmentSet(MAX_SESSIONS) };
    const sim = new PracticeSim(a);
    sim.as(a).attest(5);
    sim.as(b).attest(5);
    const keys = sim.entries().map(([k]) => k);
    expect(new Set(keys).size).toBe(2);
  });
});
