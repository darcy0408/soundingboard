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
