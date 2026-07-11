import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// isPro is synced from RevenueCat CustomerInfo by src/lib/purchases.ts (SPEC §6, P2) via setPro,
// and persisted here so the last-known entitlement survives app restarts/offline launches between
// syncs. freeSessionsUsed/isGated are independent of RevenueCat — they track the free-tier session
// count (SPEC §6) regardless of subscription status.
const FREE_SESSION_LIMIT = 3;

interface EntitlementState {
  isPro: boolean;
  freeSessionsUsed: number;
  hasHydrated: boolean;
  isGated: () => boolean;
  recordSessionCompleted: () => void;
  setPro: (isPro: boolean) => void;
  reset: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useEntitlementStore = create<EntitlementState>()(
  persist(
    (set, get) => ({
      isPro: false,
      freeSessionsUsed: 0,
      hasHydrated: false,
      isGated: () => !get().isPro && get().freeSessionsUsed >= FREE_SESSION_LIMIT,
      recordSessionCompleted: () =>
        set((state) => ({ freeSessionsUsed: state.freeSessionsUsed + 1 })),
      setPro: (isPro) => set({ isPro }),
      reset: () => set({ isPro: false, freeSessionsUsed: 0 }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'sb.entitlement',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

export { FREE_SESSION_LIMIT };
