// Practice Proof — on-device derivation of the zero-knowledge witness.
//
// Turns local practice history into the two private inputs the Compact circuit
// consumes (midnight/contract/src/practice_attestation.compact):
//
//   secretKey    32 bytes — derives the on-chain identity, never transmitted
//   commitments  10 x 32 bytes — one per completed rehearsal session
//
// Transcripts, scores, personas, goals and raw timestamps are NEVER inputs to
// anything that leaves the device. A commitment is a salted SHA-256 digest, so
// the exported file reveals neither what was practised nor when.
//
// Deliberately NOT using lib/uuid.ts here: that module documents itself as
// Math.random-based and "not used as security tokens". The secret key IS a
// security token — it is the only thing preventing someone else from attesting
// as this user — so it comes from expo-crypto's CSPRNG.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import type { SessionRecord } from '@/lib/types';

/** Must match MAX_SESSIONS in practice_attestation.compact — the circuit's
 *  witness vector is fixed-width, so this is not a soft limit. */
export const MAX_SESSIONS = 10;

/** Every commitment is a 32-byte digest (64 hex characters). */
export const COMMITMENT_HEX_LENGTH = 64;

/** Bumped if the witness file layout changes, so the dApp can reject old files. */
export const WITNESS_FORMAT_VERSION = 1;

const STORAGE_KEY = 'sb.practiceProof.keys';

/** Domain separator. Keeps these digests from colliding with any other hash
 *  this app or contract might compute over the same inputs. */
const COMMITMENT_DOMAIN = 'soundingboard:practiceproof:v1';

export type PracticeKeys = {
  /** 32-byte hex. Derives the public identity inside the circuit. */
  secretKey: string;
  /** 32-byte hex. Blinds each session commitment. */
  salt: string;
};

export type PracticeWitness = {
  version: number;
  contract: 'practice_attestation';
  maxSessions: number;
  /** How many real sessions back this witness — the value to pass to attest(). */
  claimed: number;
  secretKey: string;
  /** Exactly MAX_SESSIONS entries. Real commitments first, zero-padded tail. */
  commitments: string[];
};

let cachedKeys: PracticeKeys | null = null;

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/**
 * Returns this install's Practice Proof keys, generating and persisting them on
 * first use. Same shape as getDeviceId(), but with CSPRNG bytes rather than
 * Math.random, because both values are security-relevant.
 */
export async function getPracticeKeys(): Promise<PracticeKeys> {
  if (cachedKeys) return cachedKeys;

  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored) as PracticeKeys;
    cachedKeys = parsed;
    return parsed;
  }

  const fresh: PracticeKeys = {
    secretKey: toHex(Crypto.getRandomBytes(32)),
    salt: toHex(Crypto.getRandomBytes(32)),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  cachedKeys = fresh;
  return fresh;
}

/**
 * Forgets the Practice Proof identity. Any milestone already attested on-chain
 * stays there but becomes permanently unreachable — a new identity starts from
 * zero. Wired into the settings "delete all data" flow.
 */
export async function clearPracticeKeys(): Promise<void> {
  cachedKeys = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * Sessions that count toward a milestone: rehearsal only, and actually finished.
 * Vent sessions are coaching, not practice, and are excluded by design.
 *
 * Ordered oldest-first so the commitment set stays stable as new sessions are
 * added — re-exporting later reproduces the same digests for the same sessions.
 */
export function getEligibleSessions(sessions: SessionRecord[]): SessionRecord[] {
  return sessions
    .filter((s) => s.mode === 'rehearse' && s.completedAt !== null)
    .sort((a, b) => (a.completedAt as number) - (b.completedAt as number));
}

/** How many sessions could be attested right now, capped at circuit capacity. */
export function claimableCount(sessions: SessionRecord[]): number {
  return Math.min(getEligibleSessions(sessions).length, MAX_SESSIONS);
}

/**
 * One session -> one 32-byte commitment.
 *
 * The salt is what makes this privacy-preserving: without it, anyone holding
 * the file could confirm a guessed (sessionId, completedAt) pair by recomputing
 * the digest. With it, the digest is meaningless to anyone but this device.
 */
export async function deriveCommitment(
  salt: string,
  session: SessionRecord,
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${COMMITMENT_DOMAIN}:${salt}:${session.id}:${session.completedAt}`,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
}

/** The all-zero commitment the circuit rejects — used to pad the fixed-width vector. */
const ZERO_COMMITMENT = '0'.repeat(COMMITMENT_HEX_LENGTH);

/**
 * Builds the witness for the highest milestone this device can currently prove.
 *
 * Padding is zero-filled to reach the circuit's fixed width. The circuit
 * explicitly rejects a claimed zero commitment, so `claimed` can never exceed
 * the number of real sessions — padding cannot be passed off as practice.
 */
export async function buildWitness(sessions: SessionRecord[]): Promise<PracticeWitness> {
  const { secretKey, salt } = await getPracticeKeys();
  const eligible = getEligibleSessions(sessions).slice(0, MAX_SESSIONS);

  const real = await Promise.all(eligible.map((s) => deriveCommitment(salt, s)));
  const commitments = [
    ...real,
    ...Array<string>(MAX_SESSIONS - real.length).fill(ZERO_COMMITMENT),
  ];

  return {
    version: WITNESS_FORMAT_VERSION,
    contract: 'practice_attestation',
    maxSessions: MAX_SESSIONS,
    claimed: real.length,
    secretKey,
    commitments,
  };
}
