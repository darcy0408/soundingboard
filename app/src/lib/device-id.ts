import AsyncStorage from '@react-native-async-storage/async-storage';

import { generateUuid } from '@/lib/uuid';

const STORAGE_KEY = 'sb.deviceId';

let cachedId: string | null = null;

/** Returns a stable per-install device ID, generating and persisting one on first use. */
export async function getDeviceId(): Promise<string> {
  if (cachedId) return cachedId;

  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored) {
    cachedId = stored;
    return stored;
  }

  const fresh = generateUuid();
  await AsyncStorage.setItem(STORAGE_KEY, fresh);
  cachedId = fresh;
  return fresh;
}

/**
 * Forgets the cached device ID so a fresh one is generated on next use.
 *
 * AsyncStorage.clear() removes the stored value, but `cachedId` outlives it for
 * the rest of the process — so without this, "Delete all my data" would keep
 * sending the old ID to the Worker until the app was restarted. Same reason
 * clearPracticeKeys() exists in lib/practiceProof.ts.
 */
export async function clearDeviceId(): Promise<void> {
  cachedId = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
}
