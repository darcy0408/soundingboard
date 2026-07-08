// Shared types for the SoundingBoard app. Mirrors the Worker contract in SPEC.md §3 exactly —
// keep field names/casing in sync with worker/src if the contract ever changes.

export type SessionMode = 'rehearse' | 'vent';

export type Temperament =
  | 'Dismissive'
  | 'Defensive'
  | 'Guilt-tripping'
  | 'Hot-tempered'
  | 'Cold & withdrawn';

export type Difficulty = 1 | 2 | 3;

export interface PersonaConfig {
  name: string;
  relationship: string;
  temperament: Temperament;
  goal: string;
  difficulty: Difficulty;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FeedbackMoment {
  quote: string;
  type: 'worked' | 'try_instead';
  note: string;
}

export interface FeedbackResult {
  scores: {
    clarity: 1 | 2 | 3 | 4 | 5;
    composure: 1 | 2 | 3 | 4 | 5;
    assertiveness: 1 | 2 | 3 | 4 | 5;
  };
  moments: FeedbackMoment[];
  one_thing: string;
  encouragement: string;
}

export interface SessionRecord {
  id: string;
  mode: SessionMode;
  config: PersonaConfig | null;
  messages: ChatMessage[];
  createdAt: number;
  completedAt: number | null;
  feedback: FeedbackResult | null;
}

export interface ScenarioPreset {
  id: string;
  title: string;
  relationship: string;
  temperament: Temperament;
  goal: string;
}

export type ScenarioCategory = 'Family' | 'Relationship' | 'Roommate' | 'Friendship' | 'Work';
