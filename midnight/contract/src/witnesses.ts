// TypeScript implementations of the Practice Proof witnesses.
//
// These run on the user's own machine, inside the prover. Neither value ever
// leaves the device: the circuit consumes them and the resulting proof reveals
// only the identity hash and the claimed milestone.
//
// The same shapes are what the mobile app must produce in Phase 3
// (app/src/lib/practiceProof.ts) and what the attest dApp loads from the
// exported witness file in Phase 2.

/** Number of commitment slots the circuit accepts. Must match MAX_SESSIONS in
 *  practice_attestation.compact — the vector width is fixed at compile time. */
export const MAX_SESSIONS = 10;

/** Every commitment is a 32-byte digest. */
export const COMMITMENT_BYTES = 32;

export type PracticePrivateState = {
  /** 32-byte device-local secret. Generated once, never transmitted. */
  secretKey: Uint8Array;
  /** Exactly MAX_SESSIONS entries of 32 bytes each. Slots past the claimed
   *  count are ignored by the circuit and may be zero-filled padding. */
  commitments: Uint8Array[];
};

export type PracticeWitnesses = {
  practiceSecretKey: (ctx: { privateState: PracticePrivateState }) => [PracticePrivateState, Uint8Array];
  sessionCommitments: (ctx: { privateState: PracticePrivateState }) => [PracticePrivateState, Uint8Array[]];
};

export const witnesses: PracticeWitnesses = {
  practiceSecretKey: ({ privateState }) => [privateState, privateState.secretKey],
  sessionCommitments: ({ privateState }) => [privateState, privateState.commitments],
};

/**
 * Pads a list of real session commitments out to the fixed circuit width.
 *
 * Padding is zero-filled, which means padding slots are all EQUAL to each
 * other. That is safe only because the circuit masks off every slot at or
 * beyond the claimed count — see the `counted` mask in `attest`. It is also
 * why `claimed` must never exceed the number of real commitments supplied.
 */
export function padCommitments(real: Uint8Array[]): Uint8Array[] {
  if (real.length > MAX_SESSIONS) {
    throw new Error(`too many commitments: ${real.length} > MAX_SESSIONS (${MAX_SESSIONS})`);
  }
  for (const c of real) {
    if (c.length !== COMMITMENT_BYTES) {
      throw new Error(`commitment must be ${COMMITMENT_BYTES} bytes, got ${c.length}`);
    }
  }
  const padded = [...real];
  while (padded.length < MAX_SESSIONS) {
    padded.push(new Uint8Array(COMMITMENT_BYTES));
  }
  return padded;
}
