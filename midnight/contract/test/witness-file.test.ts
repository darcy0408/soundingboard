// Validates the witness FILE FORMAT that crosses process boundaries:
//
//   app/src/lib/practiceProof.ts  ->  exported JSON  ->  attest dApp  ->  this circuit
//
// The app derives commitments in React Native and the dApp proves them in a
// browser, so nothing type-checks across that seam. This suite pins the format
// by running a representative exported file straight through the real contract.
//
// test/fixtures/sample-witness.json is generated with the exact derivation in
// practiceProof.ts — sha256("soundingboard:practiceproof:v1:<salt>:<id>:<completedAt>")
// — so it is what the app actually emits, not hand-written hex. It also serves
// as the standalone demo input if the mobile export is ever unavailable.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PracticeSim, MAX_SESSIONS } from "./simulator.js";
import type { PracticePrivateState } from "../src/witnesses.js";

type WitnessFile = {
  version: number;
  contract: string;
  maxSessions: number;
  claimed: number;
  secretKey: string;
  commitments: string[];
};

const fixturePath = fileURLToPath(
  new URL("./fixtures/sample-witness.json", import.meta.url),
);
const witness = JSON.parse(readFileSync(fixturePath, "utf8")) as WitnessFile;

const fromHex = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));

const toPrivateState = (w: WitnessFile): PracticePrivateState => ({
  secretKey: fromHex(w.secretKey),
  commitments: w.commitments.map(fromHex),
});

describe("exported witness file — format", () => {
  it("declares the format version the dApp expects", () => {
    expect(witness.version).toBe(1);
    expect(witness.contract).toBe("practice_attestation");
  });

  it("agrees with the circuit on capacity", () => {
    expect(witness.maxSessions).toBe(MAX_SESSIONS);
    expect(witness.commitments).toHaveLength(MAX_SESSIONS);
  });

  it("carries a 32-byte secret and 32-byte commitments", () => {
    expect(witness.secretKey).toHaveLength(64);
    for (const c of witness.commitments) {
      expect(c).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("pads the tail rather than shortening the vector", () => {
    const zero = "0".repeat(64);
    const real = witness.commitments.filter((c) => c !== zero);
    expect(real).toHaveLength(witness.claimed);
    // Real commitments come first, padding after — order matters to the mask.
    expect(witness.commitments.slice(0, witness.claimed)).toEqual(real);
  });

  it("derives distinct commitments for distinct sessions", () => {
    const real = witness.commitments.slice(0, witness.claimed);
    expect(new Set(real).size).toBe(witness.claimed);
  });
});

describe("exported witness file — accepted by the circuit", () => {
  it("attests the claimed milestone end to end", () => {
    const ps = toPrivateState(witness);
    const sim = new PracticeSim(ps);
    sim.as(ps).attest(witness.claimed);

    const entries = sim.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0][1]).toBe(BigInt(witness.claimed));
  });

  it("allows attesting a milestone below the claimed count", () => {
    const ps = toPrivateState(witness);
    const sim = new PracticeSim(ps);
    sim.as(ps).attest(witness.claimed - 1);
    expect(sim.entries()[0][1]).toBe(BigInt(witness.claimed - 1));
  });

  it("rejects over-claiming into the padding", () => {
    // The app computes `claimed` itself; this is the circuit refusing to take
    // its word for it. Padding is not practice.
    const ps = toPrivateState(witness);
    const sim = new PracticeSim(ps);
    expect(() => sim.as(ps).attest(witness.claimed + 1)).toThrow(
      "claimed more sessions than commitments supplied",
    );
  });

  it("publishes no commitment from the file on-chain", () => {
    const ps = toPrivateState(witness);
    const sim = new PracticeSim(ps);
    sim.as(ps).attest(witness.claimed);

    const published = sim.entries().map(([k]) => k);
    for (const c of witness.commitments) {
      expect(published).not.toContain(c);
    }
    // ...nor the secret key itself.
    expect(published).not.toContain(witness.secretKey);
  });
});
