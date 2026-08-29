// The exported witness FILE format — the one thing that crosses every process
// boundary in this project:
//
//   app/src/lib/practiceProof.ts (React Native)
//     -> exported JSON
//       -> attest dApp (browser)  and  phase0-smoke/scripts/attest.ts (node)
//         -> practice_attestation.compact (the circuit)
//
// Nothing type-checks across those seams, so the format is defined once, here,
// beside the contract that consumes it. Both readers import this module rather
// than re-implementing the checks; test/witness-file.test.ts pins the same
// invariants against the real circuit.
//
// Deliberately free of node: and DOM imports — this runs in a browser too.
//
// These checks are a courtesy, not a security boundary. The circuit enforces
// every one of them itself; validating here just turns a proof that fails deep
// inside wasm into a sentence that names the problem.

import { MAX_SESSIONS, COMMITMENT_BYTES, type PracticePrivateState } from "./witnesses.js";

export const WITNESS_FILE_VERSION = 1;
export const CONTRACT_NAME = "practice_attestation";

export type WitnessFile = {
  version: number;
  contract: string;
  maxSessions: number;
  claimed: number;
  secretKey: string;
  commitments: string[];
};

/** A commitment slot that carries no session — the tail padding. */
export const ZERO_COMMITMENT = "0".repeat(COMMITMENT_BYTES * 2);

const HEX32 = new RegExp(`^[0-9a-f]{${COMMITMENT_BYTES * 2}}$`);

export class WitnessFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WitnessFileError";
  }
}

export function hexToBytes(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g);
  if (!pairs) return new Uint8Array(0);
  return Uint8Array.from(pairs.map((b) => parseInt(b, 16)));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validates a parsed witness file and returns it narrowed.
 *
 * @param value  the result of JSON.parse — shape is not trusted
 * @param source a label used in error messages (a path, or "uploaded file")
 */
export function parseWitnessFile(value: unknown, source = "witness file"): WitnessFile {
  const bad = (m: string): never => {
    throw new WitnessFileError(`${source}: ${m}`);
  };

  if (typeof value !== "object" || value === null) bad("is not a JSON object");
  const w = value as Partial<WitnessFile>;

  if (w.version !== WITNESS_FILE_VERSION) {
    bad(`unsupported version ${String(w.version)} (expected ${WITNESS_FILE_VERSION})`);
  }
  if (w.contract !== CONTRACT_NAME) {
    bad(`is for "${String(w.contract)}", not "${CONTRACT_NAME}"`);
  }
  if (w.maxSessions !== MAX_SESSIONS) {
    bad(`maxSessions ${String(w.maxSessions)} does not match the circuit (${MAX_SESSIONS})`);
  }
  if (!Array.isArray(w.commitments) || w.commitments.length !== MAX_SESSIONS) {
    bad(`expected ${MAX_SESSIONS} commitments, got ${w.commitments?.length ?? "none"}`);
  }
  if (typeof w.secretKey !== "string" || !HEX32.test(w.secretKey)) {
    bad(`secretKey is not ${COMMITMENT_BYTES} bytes of lowercase hex`);
  }
  const commitments = w.commitments as string[];
  commitments.forEach((c, i) => {
    if (typeof c !== "string" || !HEX32.test(c)) {
      bad(`commitment ${i} is not ${COMMITMENT_BYTES} bytes of lowercase hex`);
    }
  });

  if (typeof w.claimed !== "number" || !Number.isInteger(w.claimed)) {
    bad(`claimed is not an integer: ${String(w.claimed)}`);
  }
  assertClaimable(w as WitnessFile, w.claimed as number, source);

  return w as WitnessFile;
}

/** Number of commitment slots that hold a real session rather than padding. */
export function realCommitmentCount(w: WitnessFile): number {
  return w.commitments.filter((c) => c !== ZERO_COMMITMENT).length;
}

/**
 * Checks that `claimed` is a milestone this file can actually back.
 *
 * Split out from parseWitnessFile because a user may attest to LESS than the
 * file supports — the circuit permits it, and the dApp offers it — so the same
 * rules have to be re-checked against a chosen value, not just the file's own.
 */
export function assertClaimable(w: WitnessFile, claimed: number, source = "witness file"): void {
  const bad = (m: string): never => {
    throw new WitnessFileError(`${source}: ${m}`);
  };

  if (!Number.isInteger(claimed)) bad(`claimed must be an integer, got ${String(claimed)}`);
  if (claimed < 1) bad(`claimed must be at least 1, got ${claimed}`);
  if (claimed > MAX_SESSIONS) bad(`claimed ${claimed} exceeds MAX_SESSIONS (${MAX_SESSIONS})`);

  const real = realCommitmentCount(w);
  if (claimed > real) bad(`claimed ${claimed} but only ${real} non-padding commitments`);

  // Padding slots are all equal, so a duplicate inside the claimed prefix is
  // either a genuine repeat or padding counted as practice. Both are rejected.
  if (new Set(w.commitments.slice(0, claimed)).size !== claimed) {
    bad(`duplicate commitments inside the first ${claimed} slots`);
  }
}

/** The witness file IS the private state — this is the only conversion needed. */
export function toPrivateState(w: WitnessFile): PracticePrivateState {
  return {
    secretKey: hexToBytes(w.secretKey),
    commitments: w.commitments.map(hexToBytes),
  };
}

export { MAX_SESSIONS, COMMITMENT_BYTES };
