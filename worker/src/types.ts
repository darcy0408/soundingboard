// Shared request/response shapes for the SoundingBoard Worker.
// Mirrors SPEC.md §3 "Worker endpoints".

export type Temperament =
  | "Dismissive"
  | "Defensive"
  | "Guilt-tripping"
  | "Hot-tempered"
  | "Cold & withdrawn";

export type Difficulty = 1 | 2 | 3;

export interface Persona {
  name: string;
  relationship: string;
  temperament: Temperament;
  /** Free-text: what the user wants out of the conversation. */
  goal: string;
  difficulty: Difficulty;
  /** Optional 1-3 sentence scenario context. Not in SPEC's persona shape
   *  explicitly but referenced by the prompt as {{SCENARIO_CONTEXT}} — the
   *  app supplies it; default to the goal text if omitted. */
  scenarioContext?: string;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type Mode = "rehearse" | "vent";

export interface TurnRequest {
  mode: Mode;
  persona: Persona;
  messages: ChatMessage[];
  turn_index: number;
}

export interface TurnResponse {
  reply: string;
}

export interface FeedbackRequest {
  persona: Persona;
  messages: ChatMessage[];
}

export interface FeedbackScores {
  clarity: 1 | 2 | 3 | 4 | 5;
  composure: 1 | 2 | 3 | 4 | 5;
  assertiveness: 1 | 2 | 3 | 4 | 5;
}

export interface FeedbackMoment {
  quote: string;
  type: "worked" | "try_instead";
  note: string;
}

export interface FeedbackResponse {
  scores: FeedbackScores;
  moments: FeedbackMoment[];
  one_thing: string;
  encouragement: string;
}

export interface TtsRequest {
  text: string;
  temperament: Temperament;
}

export interface ErrorResponse {
  error: string;
  message: string;
}

/** Cloudflare Worker bindings + secrets (see wrangler.toml). */
export interface Env {
  RATE_LIMIT: KVNamespace;
  ANTHROPIC_API_KEY: string;
  CARTESIA_API_KEY?: string;
  ALLOWED_ORIGIN?: string;
}
