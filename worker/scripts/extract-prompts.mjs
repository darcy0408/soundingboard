#!/usr/bin/env node
// Generates worker/src/prompts.generated.ts from the canonical prompt
// markdown files in ../prompts/*.md.
//
// The prompt files are owned by the planning model (see repo CLAUDE.md /
// SPEC.md §3 "Prompts are owned by the planning model"). This script does
// NOT alter their wording — it only extracts verbatim text between markers
// and re-serializes it as TypeScript string constants so the Worker can
// import them. If a marker is missing, the script fails loudly rather than
// silently shipping a stale/empty prompt.
//
// Run via `npm run generate-prompts` (also wired as prebuild/predeploy).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "..", "..", "prompts");
const OUT_DIR = join(__dirname, "..", "src");
const OUT_FILE = join(OUT_DIR, "prompts.generated.ts");

function readPromptFile(name) {
  const path = join(PROMPTS_DIR, name);
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`Could not read prompt source ${path}: ${err.message}`);
  }
}

/** Extract the first text block between a start and end marker line (exclusive), trimmed. */
function extractBetween(source, startMarker, endMarker, label) {
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`Marker "${startMarker}" not found while extracting ${label}`);
  }
  const contentStart = source.indexOf("\n", startIdx) + 1;
  const endIdx = source.indexOf(endMarker, contentStart);
  if (endIdx === -1) {
    throw new Error(`Marker "${endMarker}" not found while extracting ${label}`);
  }
  return source.slice(contentStart, endIdx).trim();
}

/**
 * Extract a markdown bullet list where each item starts with
 * "- **Key**: rest of text" (possibly spanning to end of line only).
 * Returns an array of [key, text] pairs in document order, restricted to
 * the section between sectionHeading and the next "## " heading.
 */
function extractBulletMap(source, sectionHeading, label) {
  const startIdx = source.indexOf(sectionHeading);
  if (startIdx === -1) {
    throw new Error(`Section "${sectionHeading}" not found while extracting ${label}`);
  }
  const afterHeading = source.indexOf("\n", startIdx) + 1;
  const nextHeadingIdx = source.indexOf("\n## ", afterHeading);
  const sectionEnd = nextHeadingIdx === -1 ? source.indexOf("\n---", afterHeading) : nextHeadingIdx;
  const section = source.slice(afterHeading, sectionEnd === -1 ? undefined : sectionEnd);

  const bulletRe = /^- \*\*(.+?)\*\*:\s*(.+)$/gm;
  const entries = [];
  let match;
  while ((match = bulletRe.exec(section)) !== null) {
    const key = match[1].trim();
    const text = match[2].trim();
    entries.push([key, text]);
  }
  if (entries.length === 0) {
    throw new Error(`No bullet entries found in section "${sectionHeading}" while extracting ${label}`);
  }
  return entries;
}

/** Extract the fenced ```json code block that immediately follows a heading. */
function extractJsonBlock(source, heading, label) {
  const headingIdx = source.indexOf(heading);
  if (headingIdx === -1) {
    throw new Error(`Heading "${heading}" not found while extracting ${label}`);
  }
  const fenceStart = source.indexOf("```json", headingIdx);
  if (fenceStart === -1) {
    throw new Error(`No \`\`\`json block found after "${heading}" while extracting ${label}`);
  }
  const contentStart = source.indexOf("\n", fenceStart) + 1;
  const fenceEnd = source.indexOf("```", contentStart);
  if (fenceEnd === -1) {
    throw new Error(`Unterminated \`\`\`json block after "${heading}" while extracting ${label}`);
  }
  const raw = source.slice(contentStart, fenceEnd).trim();
  // Validate it parses as JSON so we fail fast on malformed source.
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`FEEDBACK_SCHEMA block is not valid JSON: ${err.message}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// persona-system.md
// ---------------------------------------------------------------------------
const personaSource = readPromptFile("persona-system.md");

const personaTemplate = extractBetween(
  personaSource,
  "## PROMPT START",
  "## PROMPT END",
  "persona template"
);

const temperamentEntries = extractBulletMap(
  personaSource,
  "## Temperament notes",
  "temperament notes"
);
if (temperamentEntries.length !== 5) {
  throw new Error(`Expected 5 temperament entries, found ${temperamentEntries.length}`);
}

const difficultyEntries = extractBulletMap(
  personaSource,
  "## Difficulty rules",
  "difficulty rules"
).map(([key, text]) => {
  // Keys look like "1 (Gentle)" — normalize to the leading digit so the
  // Worker can look up by {{DIFFICULTY}} (1|2|3) directly.
  const digitMatch = key.match(/^(\d+)/);
  if (!digitMatch) {
    throw new Error(`Could not parse difficulty number from key "${key}"`);
  }
  return [digitMatch[1], text];
});
if (difficultyEntries.length !== 3) {
  throw new Error(`Expected 3 difficulty entries, found ${difficultyEntries.length}`);
}

// The reminder block lives in its own fenced code block after the
// "## Persona reminder block" heading — extract via regex since it's not
// bounded by PROMPT START/END markers.
const reminderSectionIdx = personaSource.indexOf("## Persona reminder block");
if (reminderSectionIdx === -1) {
  throw new Error('Section "## Persona reminder block" not found while extracting persona reminder');
}
const reminderFenceMatch = personaSource.slice(reminderSectionIdx).match(/```\n([\s\S]*?)\n```/);
if (!reminderFenceMatch) {
  throw new Error("Could not locate persona_reminder fenced block");
}
const personaReminderBlock = reminderFenceMatch[1].trim();
if (!personaReminderBlock.startsWith("<persona_reminder>")) {
  throw new Error("persona_reminder fenced block did not start with <persona_reminder> tag");
}

// ---------------------------------------------------------------------------
// vent-coach.md
// ---------------------------------------------------------------------------
const ventSource = readPromptFile("vent-coach.md");
const ventCoachPrompt = extractBetween(
  ventSource,
  "## PROMPT START",
  "## PROMPT END",
  "vent coach prompt"
);

// ---------------------------------------------------------------------------
// Crisis response — the fixed, verbatim break-character message. Both
// persona-system.md and vent-coach.md define a SAFETY section with
// `reply with exactly this and nothing else:` followed by a quoted string.
// The Worker must be able to return this without calling the model
// (SPEC.md §3/§4), so we extract it once here and assert both source files
// agree — if the planning model ever lets them drift, this script fails
// loudly instead of shipping the wrong one.
// ---------------------------------------------------------------------------
function extractCrisisMessage(source, label) {
  const match = source.match(/reply with exactly this and nothing else:\s*\n"([^"]+)"/);
  if (!match) {
    throw new Error(`Could not find crisis SAFETY message in ${label}`);
  }
  return match[1];
}

const personaCrisisMessage = extractCrisisMessage(personaSource, "persona-system.md");
const ventCrisisMessage = extractCrisisMessage(ventSource, "vent-coach.md");
if (personaCrisisMessage !== ventCrisisMessage) {
  throw new Error(
    "Crisis SAFETY message differs between persona-system.md and vent-coach.md — " +
      "the planning model must keep these identical, or the Worker needs a per-mode message."
  );
}
const crisisResponse = personaCrisisMessage;

// ---------------------------------------------------------------------------
// feedback.md
// ---------------------------------------------------------------------------
const feedbackSource = readPromptFile("feedback.md");
const feedbackTemplate = extractBetween(
  feedbackSource,
  "## PROMPT START",
  "## PROMPT END",
  "feedback template"
);
const feedbackSchema = extractJsonBlock(feedbackSource, "## FEEDBACK_SCHEMA", "feedback schema");

// ---------------------------------------------------------------------------
// Render TypeScript output
// ---------------------------------------------------------------------------
function tsStringLiteral(str) {
  return JSON.stringify(str);
}

function tsRecordLiteral(entries) {
  const lines = entries.map(([key, value]) => `  ${tsStringLiteral(key)}: ${tsStringLiteral(value)},`);
  return `{\n${lines.join("\n")}\n}`;
}

const banner = `// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Produced by \`worker/scripts/extract-prompts.mjs\` from the canonical
// prompt sources in \`prompts/*.md\` (owned by the planning model). Re-run
// \`npm run generate-prompts\` after any change to those files. This file
// is checked into version control so the Worker has no runtime dependency
// on the prompts/ directory (it does not ship with the deployed Worker).
//
// Generated at: ${new Date().toISOString()}
`;

const output = `${banner}
export const PERSONA_TEMPLATE = ${tsStringLiteral(personaTemplate)};

export const TEMPERAMENT_NOTES: Record<string, string> = ${tsRecordLiteral(temperamentEntries)};

export const DIFFICULTY_RULES: Record<string, string> = ${tsRecordLiteral(difficultyEntries)};

export const PERSONA_REMINDER_TEMPLATE = ${tsStringLiteral(personaReminderBlock)};

export const VENT_COACH_PROMPT = ${tsStringLiteral(ventCoachPrompt)};

export const CRISIS_RESPONSE = ${tsStringLiteral(crisisResponse)};

export const FEEDBACK_TEMPLATE = ${tsStringLiteral(feedbackTemplate)};

export const FEEDBACK_SCHEMA = ${JSON.stringify(feedbackSchema, null, 2)} as const;
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, output, "utf8");
console.log(`Wrote ${OUT_FILE}`);
console.log(`  temperaments: ${temperamentEntries.map(([k]) => k).join(", ")}`);
console.log(`  difficulty levels: ${difficultyEntries.map(([k]) => k).join(", ")}`);
