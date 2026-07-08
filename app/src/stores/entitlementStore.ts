import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Stub entitlement store for P0/P1. RevenueCat wiring happens in P2 (SPEC §8) — this exists so the
// gate at end-of-session (SPEC §6) can be built and tested end-to-end before RevenueCat lands.
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
