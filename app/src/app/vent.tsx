import { Redirect } from 'expo-router';
import { useState } from 'react';

import { useOnboardingStore } from '@/stores/onboardingStore';
import { useSessionStore } from '@/stores/sessionStore';

/** Vent mode has no setup screen — jump straight into a session (SPEC §2, Mode B). */
export default function Vent() {
  // SPEC §5.1: no session may start before the AI-consent screen has been explicitly agreed to.
  // Home already gates on this, but /vent is directly reachable (e.g. a deep link), and this
  // screen starts a session as a side effect of rendering, so it needs its own guard.
  const onboardingCompleted = useOnboardingStore((s) => s.completed);
  const startSession = useSessionStore((s) => s.startSession);
  const [id] = useState<string | null>(() => (onboardingCompleted ? startSession('vent', null) : null));

  if (!onboardingCompleted) {
    return <Redirect href="/onboarding/welcome" />;
  }

  return <Redirect href={`/session/${id}`} />;
}
