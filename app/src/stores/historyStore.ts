import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { SessionRecord } from '@/lib/types';

interface HistoryState {
  sessions: SessionRecord[];
  hasHydrated: boolean;
  addOrUpdateSession: (session: SessionRecord) => void;
  getSession: (id: string) => SessionRecord | undefined;
  clearAll: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      sessions: [],
      hasHydrated: false,
      addOrUpdateSession: (session) =>
        set((state) => {
          const existingIndex = state.sessions.findIndex((s) => s.id === session.id);
          if (existingIndex === -1) {
            return { sessions: [session, ...state.sessions] };
          }
          const next = [...state.sessions];
          next[existingIndex] = session;
          return { sessions: next };
        }),
      getSession: (id) => get().sessions.find((s) => s.id === id),
      clearAll: () => set({ sessions: [] }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'sb.history',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
