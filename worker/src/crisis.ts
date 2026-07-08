// Crisis keyword pre-filter (SPEC.md §3/§4): scans the latest user message
// for self-harm / suicide / harm-others language and, on a match, the
// Worker returns CRISIS_RESPONSE (the exact SAFETY text from the prompt
// files) WITHOUT calling the model.
//
// This is a coarse, high-recall heuristic by design — false positives just
// cost the user one extra "are you okay" style message and a retry, false
// negatives are the real risk. Matches whole phrases, case-insensitive,
// tolerant of common punctuation/whitespace variation between words.

export { CRISIS_RESPONSE } from "./prompts.generated";

// Each entry is a regex source matched against the lowercased message with
// whitespace runs treated flexibly (see toFlexibleRegex). Keep entries as
// plain phrases here for readability/maintainability.
const CRISIS_PHRASES: string[] = [
  // Self-harm / suicide — first person intent or ideation.
  "kill myself",
  "killing myself",
  "kill me",
  "end my life",
  "ending my life",
  "end it all",
  "ending it all",
  "want to die",
  "wish i was dead",
  "wish i were dead",
  "wish i were never born",
  "better off dead",
  "better off without me",
  "hurt myself",
  "hurting myself",
  "harm myself",
  "harming myself",
  "cut myself",
  "cutting myself",
  "suicide",
  "suicidal",
  "take my own life",
  "taking my own life",
  "not want to be alive",
  "no reason to live",
  "don't want to live",
  "do not want to live",
  "can't go on",
  "cannot go on",
  "self harm",
  "self-harm",
  "overdose",
  "od on",

  // Harm to others — first person intent, generic and pronoun forms.
  "kill him",
  "kill her",
  "kill them",
  "kill you",
  "murder him",
  "murder her",
  "murder them",
  "hurt him",
  "hurt her",
  "hurt them",
  "beat him up",
  "beat her up",
  "gonna hurt",
  "going to hurt",
  "gonna kill",
  "going to kill",
  "want him dead",
  "want her dead",
  "want them dead",
];

/** Converts a phrase like "kill myself" into a regex tolerant of extra
 *  whitespace/hyphens between words (e.g. "kill  myself", "kill-myself"). */
function toFlexibleRegex(phrase: string): RegExp {
  const escaped = phrase
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s-]+");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

const CRISIS_PATTERNS = CRISIS_PHRASES.map(toFlexibleRegex);

/** Returns true if `text` contains crisis language per the phrase list above. */
export function containsCrisisLanguage(text: string): boolean {
  if (!text) return false;
  return CRISIS_PATTERNS.some((re) => re.test(text));
}
