import { Redirect } from 'expo-router';
import { useState } from 'react';

import { useSessionStore } from '@/stores/sessionStore';

/** Vent mode has no setup screen — jump straight into a session (SPEC §2, Mode B). */
export default function Vent() {
  const startSession = useSessionStore((s) => s.startSession);
  const [id] = useState(() => startSession('vent', null));

  return <Redirect href={`/session/${id}`} />;
}
