import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Small settings slice for P1 voice preferences (SPEC.md §8). Follows the same
// zustand + AsyncStorage persistence pattern as onboardingStore/entitlementStore.
interface SettingsState {
  /** Whether assistant replies are spoken aloud (Worker TTS, falling back to on-device TTS). */
  voiceEnabled: boolean;
  hasHydrated: boolean;
  setVoiceEnabled: (value: boolean) => void;
  toggleVoiceEnabled: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      voiceEnabled: true,
      hasHydrated: false,
      setVoiceEnabled: (value) => set({ voiceEnabled: value }),
      toggleVoiceEnabled: () => set({ voiceEnabled: !get().voiceEnabled }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'sb.settings',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
