import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Small settings slice for P1 voice preferences (SPEC.md §8). Follows the same
// zustand + AsyncStorage persistence pattern as onboardingStore/entitlementStore.
interface SettingsState {
  /** Whether assistant replies are spoken aloud (Worker TTS, falling back to on-device TTS). */
  voiceEnabled: boolean;
  /** Whether the user has accepted the in-app mic disclosure that must precede the OS
   *  permission prompt (Google Play prominent-disclosure rule — store/play-compliance.md P-5). */
  micDisclosureAccepted: boolean;
  hasHydrated: boolean;
  setVoiceEnabled: (value: boolean) => void;
  toggleVoiceEnabled: () => void;
  setMicDisclosureAccepted: (value: boolean) => void;
  setHasHydrated: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      voiceEnabled: true,
      micDisclosureAccepted: false,
      hasHydrated: false,
      setVoiceEnabled: (value) => set({ voiceEnabled: value }),
      toggleVoiceEnabled: () => set({ voiceEnabled: !get().voiceEnabled }),
      setMicDisclosureAccepted: (value) => set({ micDisclosureAccepted: value }),
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
