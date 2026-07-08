import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface OnboardingState {
  completed: boolean;
  hasHydrated: boolean;
  complete: () => void;
  reset: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      hasHydrated: false,
      complete: () => set({ completed: true }),
      reset: () => set({ completed: false }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'sb.onboarding',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
