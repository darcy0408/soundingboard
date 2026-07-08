import { create } from 'zustand';

import { generateUuid } from '@/lib/uuid';
import type { ChatMessage, PersonaConfig, SessionMode } from '@/lib/types';

export const TURN_CAP = 30;

/** SPEC.md §6: once the free tier is exhausted (feedback reports gated), sessions are
 *  additionally capped at 5 turns instead of the normal 30. */
export const GATED_TURN_CAP = 5;

export type SessionStatus = 'idle' | 'awaiting-reply' | 'error';

interface SessionState {
  id: string | null;
  mode: SessionMode | null;
  config: PersonaConfig | null;
  messages: ChatMessage[];
  turnIndex: number;
  status: SessionStatus;
  errorMessage: string | null;
  createdAt: number | null;

  /** Starts a fresh in-memory session and returns its ID. */
  startSession: (mode: SessionMode, config: PersonaConfig | null) => string;
  appendUserMessage: (content: string) => void;
  appendAssistantMessage: (content: string) => void;
  setStatus: (status: SessionStatus, errorMessage?: string | null) => void;
  incrementTurn: () => number;
  userTurnCount: () => number;
  reset: () => void;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  id: null,
  mode: null,
  config: null,
  messages: [],
  turnIndex: 0,
  status: 'idle',
  errorMessage: null,
  createdAt: null,

  startSession: (mode, config) => {
    const id = generateUuid();
    set({
      id,
      mode,
      config,
      messages: [],
      turnIndex: 0,
      status: 'idle',
      errorMessage: null,
      createdAt: Date.now(),
    });
    return id;
  },

  appendUserMessage: (content) =>
    set((state) => ({ messages: [...state.messages, { role: 'user', content }] })),

  appendAssistantMessage: (content) =>
    set((state) => ({ messages: [...state.messages, { role: 'assistant', content }] })),

  setStatus: (status, errorMessage = null) => set({ status, errorMessage }),

  incrementTurn: () => {
    const next = get().turnIndex + 1;
    set({ turnIndex: next });
    return next;
  },

  userTurnCount: () => get().messages.filter((m) => m.role === 'user').length,

  reset: () =>
    set({
      id: null,
      mode: null,
      config: null,
      messages: [],
      turnIndex: 0,
      status: 'idle',
      errorMessage: null,
      createdAt: null,
    }),
}));
