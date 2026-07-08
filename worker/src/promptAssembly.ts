// Fills the {{PLACEHOLDER}} templates extracted from prompts/*.md.
//
// This module never alters the wording of the generated templates — it only
// does string substitution. See prompts.generated.ts for the verbatim text.

import {
  PERSONA_TEMPLATE,
  TEMPERAMENT_NOTES,
  DIFFICULTY_RULES,
  PERSONA_REMINDER_TEMPLATE,
  VENT_COACH_PROMPT,
  FEEDBACK_TEMPLATE,
} from "./prompts.generated";
import type { ChatMessage, Persona } from "./types";

/** Replace every occurrence of {{KEY}} in `template` using `values[KEY]`. */
function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (!(key in values)) {
      // Leave unknown placeholders untouched rather than silently dropping
      // them — a missing mapping should be loud, not swallowed. Callers are
      // expected to supply every placeholder the template declares; tests
      // assert no `{{` survives substitution for the templates we own.
      return match;
    }
    return values[key];
  });
}

function temperamentNotesFor(persona: Persona): string {
  const notes = TEMPERAMENT_NOTES[persona.temperament];
  if (!notes) {
    throw new Error(`Unknown temperament: ${persona.temperament}`);
  }
  return notes;
}

function difficultyRulesFor(persona: Persona): string {
  const rules = DIFFICULTY_RULES[String(persona.difficulty)];
  if (!rules) {
    throw new Error(`Unknown difficulty: ${persona.difficulty}`);
  }
  return rules;
}

/** Builds the {{PLACEHOLDER}} -> value map shared by the persona template
 *  and the persona_reminder block. */
function personaPlaceholderValues(persona: Persona): Record<string, string> {
  return {
    PERSONA_NAME: persona.name,
    RELATIONSHIP: persona.relationship,
    SCENARIO_CONTEXT: persona.scenarioContext?.trim() || persona.goal,
    USER_GOAL: persona.goal,
    TEMPERAMENT: persona.temperament,
    TEMPERAMENT_NOTES: temperamentNotesFor(persona),
    DIFFICULTY: String(persona.difficulty),
    DIFFICULTY_RULES: difficultyRulesFor(persona),
  };
}

/** Builds the full rehearse-mode system prompt for a given persona. */
export function buildRehearseSystemPrompt(persona: Persona): string {
  return fillTemplate(PERSONA_TEMPLATE, personaPlaceholderValues(persona));
}

/** Vent-mode system prompt has no placeholders — returned verbatim. */
export function buildVentSystemPrompt(): string {
  return VENT_COACH_PROMPT;
}

/** The anti-agreeableness reminder block, filled for this persona. */
export function buildPersonaReminder(persona: Persona): string {
  return fillTemplate(PERSONA_REMINDER_TEMPLATE, personaPlaceholderValues(persona));
}

/**
 * SPEC.md §3 / prompts/persona-system.md "Persona reminder block":
 * "The Worker prepends this block to the user message content every 8th
 * turn (turn_index % 8 === 0, turn_index >= 8)."
 */
export function shouldInjectReminder(turnIndex: number): boolean {
  return turnIndex >= 8 && turnIndex % 8 === 0;
}

/**
 * Given the full incoming messages array for /v1/turn, returns a new array
 * with the persona_reminder block prepended to the final user message's
 * content when the reminder condition fires (rehearse mode only). Does not
 * mutate the input array.
 */
export function applyReminderIfDue(
  messages: ChatMessage[],
  persona: Persona,
  turnIndex: number,
  mode: "rehearse" | "vent"
): ChatMessage[] {
  if (mode !== "rehearse" || !shouldInjectReminder(turnIndex)) {
    return messages;
  }
  const lastUserIdx = [...messages].map((m) => m.role).lastIndexOf("user");
  if (lastUserIdx === -1) {
    return messages;
  }
  const reminder = buildPersonaReminder(persona);
  const next = messages.slice();
  next[lastUserIdx] = {
    ...next[lastUserIdx],
    content: `${reminder}\n\n${next[lastUserIdx].content}`,
  };
  return next;
}

/** Feedback system prompt, filled from persona config. */
export function buildFeedbackSystemPrompt(persona: Persona): string {
  return fillTemplate(FEEDBACK_TEMPLATE, personaPlaceholderValues(persona));
}

/**
 * Formats the transcript for /v1/feedback's single user message:
 * one line per turn, "USER: ..." / "<PersonaName>: ...".
 */
export function formatTranscript(messages: ChatMessage[], persona: Persona): string {
  return messages
    .map((m) => {
      const speaker = m.role === "user" ? "USER" : persona.name;
      return `${speaker}: ${m.content}`;
    })
    .join("\n");
}

/** Returns true if any {{...}} placeholder remains unfilled in `text`. */
export function hasUnfilledPlaceholders(text: string): boolean {
  return /\{\{\w+\}\}/.test(text);
}
