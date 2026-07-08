import type { Difficulty, ScenarioCategory, ScenarioPreset, Temperament } from '@/lib/types';

// Personal-life categories are listed first-class; Work is included but secondary (SPEC §1.3).
export const SCENARIO_CATEGORIES: ScenarioCategory[] = [
  'Family',
  'Relationship',
  'Roommate',
  'Friendship',
  'Work',
];

export const SCENARIO_PRESETS: Record<ScenarioCategory, ScenarioPreset[]> = {
  Family: [
    {
      id: 'family-boundary-parent',
      title: 'Set a boundary with a parent',
      relationship: 'parent',
      temperament: 'Guilt-tripping',
      goal: 'Get them to respect that I need advance notice before they visit.',
    },
    {
      id: 'family-sibling-comment',
      title: 'Tell a sibling their comment hurt',
      relationship: 'sibling',
      temperament: 'Defensive',
      goal: 'Get an acknowledgment without it turning into a fight.',
    },
    {
      id: 'family-unsolicited-advice',
      title: 'Ask a parent to stop giving unsolicited advice',
      relationship: 'parent',
      temperament: 'Dismissive',
      goal: 'Get them to let me make my own decisions without commentary.',
    },
  ],
  Relationship: [
    {
      id: 'relationship-feeling-unheard',
      title: 'Bring up feeling unheard in the relationship',
      relationship: 'partner',
      temperament: 'Cold & withdrawn',
      goal: 'Get them to actually engage instead of shutting down.',
    },
    {
      id: 'relationship-chores',
      title: 'Talk about wanting more help around the house',
      relationship: 'partner',
      temperament: 'Defensive',
      goal: 'Agree on a fair split of chores.',
    },
    {
      id: 'relationship-the-talk',
      title: "Have \"the talk\" about where this is going",
      relationship: 'partner',
      temperament: 'Dismissive',
      goal: 'Get a real answer about whether we want the same things.',
    },
  ],
  Roommate: [
    {
      id: 'roommate-chores',
      title: 'Confront a roommate about chores',
      relationship: 'roommate',
      temperament: 'Dismissive',
      goal: 'Get them to actually do their share of the cleaning.',
    },
    {
      id: 'roommate-bills',
      title: 'Ask a roommate to pay their share on time',
      relationship: 'roommate',
      temperament: 'Guilt-tripping',
      goal: 'Get rent and bills paid by the due date going forward.',
    },
    {
      id: 'roommate-quiet-hours',
      title: 'Set quiet-hours boundaries with a roommate',
      relationship: 'roommate',
      temperament: 'Hot-tempered',
      goal: 'Agree on quiet hours that we both actually stick to.',
    },
  ],
  Friendship: [
    {
      id: 'friend-flaking',
      title: 'Tell a friend they flaked one too many times',
      relationship: 'friend',
      temperament: 'Defensive',
      goal: 'Get them to follow through, or be honest when they can’t.',
    },
    {
      id: 'friend-talks-over',
      title: 'Address a friend who talks over me',
      relationship: 'friend',
      temperament: 'Dismissive',
      goal: 'Get them to actually make space for me in conversations.',
    },
    {
      id: 'friend-overshares',
      title: 'Set a boundary with a friend who overshares about others',
      relationship: 'friend',
      temperament: 'Guilt-tripping',
      goal: 'Get them to stop putting me in the middle of their conflicts.',
    },
  ],
  Work: [
    {
      id: 'work-raise',
      title: 'Ask for a raise',
      relationship: 'manager',
      temperament: 'Dismissive',
      goal: 'Get a clear commitment on a raise or a path to one.',
    },
    {
      id: 'work-scope-creep',
      title: 'Push back on scope creep from a manager',
      relationship: 'manager',
      temperament: 'Defensive',
      goal: 'Get realistic deadlines given the added work.',
    },
    {
      id: 'work-credit',
      title: 'Address a coworker who takes credit for my work',
      relationship: 'coworker',
      temperament: 'Hot-tempered',
      goal: 'Get them to stop, and acknowledge my contribution going forward.',
    },
  ],
};

export const TEMPERAMENTS: { value: Temperament; description: string }[] = [
  { value: 'Dismissive', description: 'Brushes off what you say, changes the subject.' },
  { value: 'Defensive', description: 'Hears everything as an attack and fires back.' },
  { value: 'Guilt-tripping', description: 'Turns your ask into their suffering.' },
  { value: 'Hot-tempered', description: 'Escalates fast — sharp tone, raised voice.' },
  { value: 'Cold & withdrawn', description: 'Shuts down, gives you as little as possible.' },
];

export const DIFFICULTIES: { value: Difficulty; label: string; description: string }[] = [
  { value: 1, label: '1 · Gentle', description: 'Pushes back, but comes around quickly.' },
  { value: 2, label: '2 · Realistic', description: 'Takes real, sustained effort to move.' },
  { value: 3, label: '3 · Hard mode', description: 'Digs in, derails, and tests you again later.' },
];
