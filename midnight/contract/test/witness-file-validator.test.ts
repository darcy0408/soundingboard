// Unit tests for the shared witness-file validator.
//
// witness-file.test.ts proves the sample file is accepted by the real circuit.
// This suite covers the other direction: everything the validator must REJECT
// before a proof is ever attempted.
//
// It matters because src/witness-file.ts is the one piece of code imported by
// both readers of the format — the headless attest script and the browser dApp —
// so a gap here is a gap in both, on two different runtimes.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  parseWitnessFile,
  assertClaimable,
  realCommitmentCount,
  toPrivateState,
  hexToBytes,
  bytesToHex,
  WitnessFileError,
  ZERO_COMMITMENT,
  MAX_SESSIONS,
  type WitnessFile,
} from "../src/witness-file.js";

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/sample-witness.json", import.meta.url)), "utf8"),
) as WitnessFile;

/** A deep copy, so a mutation in one test cannot leak into another. */
const clone = (): WitnessFile => JSON.parse(JSON.stringify(fixture)) as WitnessFile;

describe("parseWitnessFile — accepts", () => {
  it("takes the sample file the app emits", () => {
    const w = parseWitnessFile(clone());
    expect(w.claimed).toBe(7);
    expect(w.commitments).toHaveLength(MAX_SESSIONS);
  });

  it("counts real commitments and ignores padding", () => {
    expect(realCommitmentCount(clone())).toBe(7);
  });
});

describe("parseWitnessFile — rejects", () => {
  const rejects = (mutate: (w: WitnessFile) => void, match: RegExp) => {
    const w = clone();
    mutate(w);
    expect(() => parseWitnessFile(w, "test.json")).toThrow(WitnessFileError);
    expect(() => parseWitnessFile(w, "test.json")).toThrow(match);
  };

  it("a value that is not an object", () => {
    expect(() => parseWitnessFile(null)).toThrow(/not a JSON object/);
    expect(() => parseWitnessFile("nope")).toThrow(/not a JSON object/);
  });

  it("a future format version", () => rejects((w) => (w.version = 2), /unsupported version 2/));

  it("a file for a different contract", () =>
    rejects((w) => (w.contract = "something_else"), /not "practice_attestation"/));

  it("a capacity that disagrees with the circuit", () =>
    rejects((w) => (w.maxSessions = 25), /does not match the circuit/));

  it("a commitment vector of the wrong width", () =>
    rejects((w) => w.commitments.pop(), /expected 10 commitments/));

  it("a secret key that is not 32 bytes of hex", () =>
    rejects((w) => (w.secretKey = "abcd"), /secretKey is not 32 bytes/));

  // Lowercase is required so the same key always renders as the same string —
  // the fixture's own key is all 7s, so it has to be replaced rather than
  // upper-cased to exercise this at all.
  it("uppercase hex", () =>
    rejects((w) => (w.secretKey = "A".repeat(64)), /secretKey is not 32 bytes/));

  it("a malformed commitment", () =>
    rejects((w) => (w.commitments[2] = "zz"), /commitment 2 is not 32 bytes/));

  it("a claim larger than the real commitments backing it", () =>
    rejects((w) => (w.claimed = 8), /only 7 non-padding commitments/));

  it("a claim of zero", () => rejects((w) => (w.claimed = 0), /at least 1/));

  it("a claim beyond the circuit capacity", () =>
    rejects((w) => (w.claimed = 11), /exceeds MAX_SESSIONS/));

  it("a non-integer claim", () => rejects((w) => (w.claimed = 3.5), /not an integer/));

  it("a duplicate inside the claimed prefix", () =>
    rejects((w) => (w.commitments[1] = w.commitments[0]), /duplicate commitments/));
});

describe("assertClaimable", () => {
  it("permits attesting to fewer sessions than the file holds", () => {
    const w = clone();
    for (let n = 1; n <= 7; n++) expect(() => assertClaimable(w, n)).not.toThrow();
  });

  it("refuses to count a padding slot as practice", () => {
    // The whole point of the zero-commitment check: 7 real sessions must never
    // become a milestone of 8 just because the vector has room for 10.
    const w = clone();
    expect(w.commitments[7]).toBe(ZERO_COMMITMENT);
    expect(() => assertClaimable(w, 8)).toThrow(/only 7 non-padding commitments/);
  });

  it("names the caller's label in the message", () => {
    expect(() => assertClaimable(clone(), 99, "SB_CLAIMED=99")).toThrow(/^SB_CLAIMED=99:/);
  });
});

describe("hex helpers", () => {
  it("round-trip a commitment without loss", () => {
    const hex = fixture.commitments[0];
    expect(bytesToHex(hexToBytes(hex))).toBe(hex);
  });

  it("pad single-digit bytes, so length is always 64", () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16]))).toBe("00010f10");
  });

  it("convert a file to private state of the shape the witnesses expect", () => {
    const ps = toPrivateState(clone());
    expect(ps.secretKey).toHaveLength(32);
    expect(ps.commitments).toHaveLength(MAX_SESSIONS);
    for (const c of ps.commitments) expect(c).toHaveLength(32);
  });
});
