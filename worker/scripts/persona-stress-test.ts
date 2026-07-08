#!/usr/bin/env -S npx tsx
// Persona stress test (SPEC.md §10 — kill-criterion gate before P2 spend).
//
// Runs a scripted 15-turn adversarial conversation directly against the
// real Anthropic API, using the exact same prompt assembly the Worker uses
// (imported from ../src), so this test exercises the actual persona prompt
// + reminder-injection logic, not a re-implementation of it.
//
// Scenario: difficulty 3, guilt-tripping mother, "set a boundary about daily
// phone calls."
//   Turns 1-5  — ineffective user moves. Assert the persona does NOT concede.
//   Turns 6-10 — effective user moves (per prompts/persona-system.md's
//                "these moves genuinely affect you" list). No hard
//                assertion — this is the transition phase, printed for
//                human judgment.
//   Turns 11-15 — the user holds the boundary calmly. Assert the persona
//                 HAS conceded by this point (SPEC.md §10: "must concede
//                 after [the effective] turns").
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/persona-stress-test.ts
//
// Exit code is 0 if both phase assertions pass, 1 otherwise — usable as a
// CI/manual gate. Heuristics here are deliberately simple keyword checks;
// the full transcript is always printed so a human can override a
// borderline verdict.

import { buildRehearseSystemPrompt, applyReminderIfDue } from "../src/promptAssembly";
import { generateTurn } from "../src/anthropicClient";
import type { ChatMessage, Persona } from "../src/types";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Export it and re-run:");
  console.error("  ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/persona-stress-test.ts");
  process.exit(1);
}

const persona: Persona = {
  name: "Linda",
  relationship: "mother",
  temperament: "Guilt-tripping",
  goal: "Move from daily phone calls to a weekly Sunday call, without ongoing guilt about it.",
  difficulty: 3,
  scenarioContext:
    "Linda calls every single day and gets hurt or upset when the user doesn't pick up or " +
    "keeps the call short. The user wants to scale this back to once a week.",
};

type Move = { label: string; text: string };

// Turns 1-5: ineffective moves. Per prompts/persona-system.md, none of
// these should move the persona at any difficulty.
const INEFFECTIVE_MOVES: Move[] = [
  { label: "vague complaint", text: "This whole calling thing is a problem, honestly." },
  {
    label: "repetition (same line again)",
    text: "This whole calling thing is a problem, honestly. It's a real problem.",
  },
  {
    label: "pleading",
    text: "Please, please can we just not make this a whole thing, I really really need this to change.",
  },
  { label: "insult", text: "Honestly you're being kind of controlling and it's exhausting." },
  { label: "all-caps yelling", text: "WHY CAN YOU NEVER JUST LISTEN TO ME FOR ONCE" },
];

// Turns 6-10: effective moves, matching the prompt's "these moves genuinely
// affect you" list one-for-one.
const EFFECTIVE_MOVES: Move[] = [
  {
    label: "calm I-statement",
    text: "I feel overwhelmed when we talk every day, and I want to explain why instead of just avoiding your calls.",
  },
  {
    label: "acknowledge persona's view",
    text: "I know you call because you miss me and want to stay close, and I don't want you to feel shut out.",
  },
  {
    label: "one specific, concrete request",
    text: "Could we switch to one call every Sunday afternoon instead of every day? I'll actually be present for it.",
  },
  {
    label: "calmly hold the boundary",
    text: "I hear that this feels like a big change, and I still think Sunday calls are what I need going forward.",
  },
  {
    label: "de-escalate",
    text: "Let's not raise our voices about this — I want us to land somewhere that works for both of us.",
  },
];

// Turns 11-15: hold the line calmly and confirm. Difficulty 3 rule: the
// persona may test the boundary once more here — only holds the concession
// if the user holds the line calmly, which these turns do.
const CONFIRMATION_MOVES: Move[] = [
  { label: "calm confirmation", text: "So just to check — Sundays works for you going forward?" },
  {
    label: "hold the line if tested again",
    text: "I understand, and I'm not changing my mind on this one — Sunday calls, starting this week.",
  },
  { label: "warm reinforcement", text: "Thank you for hearing me out on this, it means a lot." },
  { label: "closing warmth", text: "I love you, and I'm glad we figured out something that works." },
  { label: "final check", text: "So we're set — I'll call you this Sunday." },
];

const ALL_MOVES: Move[] = [...INEFFECTIVE_MOVES, ...EFFECTIVE_MOVES, ...CONFIRMATION_MOVES];

// Deliberately simple keyword heuristic (per the task: "Heuristics can be
// simple keyword checks + printing for human judgment"). False negatives
// are expected on subtle concessions — that's why the full transcript is
// always printed for a human to review.
const AGREEMENT_MARKERS: RegExp[] = [
  /\bokay\b/i,
  /\bfine\b/i,
  /\balright\b/i,
  /\bi guess\b/i,
  /\byou'?re right\b/i,
  /\bthat works\b/i,
  /\bsounds good\b/i,
  /\bi (can|could) (do|try) that\b/i,
  /\bi'?ll (do|try) that\b/i,
  /\bi suppose\b/i,
  /\bsundays?\b.*\b(works?|it is|call)\b/i,
  /\blet'?s do that\b/i,
  /\bwe can do\b/i,
  /\bi agree\b/i,
  /\bmaybe you'?re right\b/i,
  /\bi'?ll try\b/i,
];

function containsAgreementLanguage(text: string): boolean {
  return AGREEMENT_MARKERS.some((re) => re.test(text));
}

async function main() {
  const systemPrompt = buildRehearseSystemPrompt(persona);
  const messages: ChatMessage[] = [];

  console.log("=".repeat(72));
  console.log(`Persona stress test — ${persona.name} (${persona.temperament}, difficulty ${persona.difficulty})`);
  console.log(`Goal: ${persona.goal}`);
  console.log("=".repeat(72));

  const replies: string[] = [];

  for (let i = 0; i < ALL_MOVES.length; i++) {
    const turnIndex = i + 1;
    const move = ALL_MOVES[i];
    messages.push({ role: "user", content: move.text });

    const outgoing = applyReminderIfDue(messages, persona, turnIndex, "rehearse");
    const reply = await generateTurn(API_KEY!, systemPrompt, outgoing);
    messages.push({ role: "assistant", content: reply });
    replies.push(reply);

    console.log(`\n--- Turn ${turnIndex} [${move.label}] ---`);
    console.log(`USER: ${move.text}`);
    console.log(`${persona.name}: ${reply}`);
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log("VERDICT");
  console.log("=".repeat(72));

  // Phase 1 (turns 1-5): must NOT concede.
  const phase1Replies = replies.slice(0, 5);
  const phase1Concessions = phase1Replies
    .map((r, idx) => ({ idx: idx + 1, r }))
    .filter(({ r }) => containsAgreementLanguage(r));
  const phase1Pass = phase1Concessions.length === 0;
  console.log(
    `\nPhase 1 (turns 1-5, ineffective moves) — persona must NOT concede: ${phase1Pass ? "PASS" : "FAIL"}`
  );
  if (!phase1Pass) {
    for (const c of phase1Concessions) {
      console.log(`  Turn ${c.idx} looks like a concession: "${c.r}"`);
    }
  }

  // Phase 2 (turns 6-10): transition phase, no hard assertion — printed
  // for human judgment.
  console.log(`\nPhase 2 (turns 6-10, effective moves) — transition phase, no automated verdict.`);
  const phase2FirstSoftening = replies
    .slice(5, 10)
    .map((r, idx) => ({ idx: idx + 6, r }))
    .find(({ r }) => containsAgreementLanguage(r));
  if (phase2FirstSoftening) {
    console.log(`  First detected softening at turn ${phase2FirstSoftening.idx}: "${phase2FirstSoftening.r}"`);
  } else {
    console.log(`  No clear softening detected yet by heuristic — check the transcript above by eye.`);
  }

  // Phase 3 (turns 11-15): must have conceded by now.
  const phase3Replies = replies.slice(10, 15).map((r, idx) => ({ idx: idx + 11, r }));
  const phase3Concession = phase3Replies.find(({ r }) => containsAgreementLanguage(r));
  const phase3Pass = Boolean(phase3Concession);
  console.log(
    `\nPhase 3 (turns 11-15, holding the line) — persona must concede by now: ${phase3Pass ? "PASS" : "FAIL"}`
  );
  if (phase3Concession) {
    console.log(`  Concession detected at turn ${phase3Concession.idx}: "${phase3Concession.r}"`);
  } else {
    console.log(`  No concession language detected by heuristic in turns 11-15 — review the transcript above.`);
  }

  console.log(`\n${"=".repeat(72)}`);
  const overallPass = phase1Pass && phase3Pass;
  console.log(`OVERALL: ${overallPass ? "PASS" : "FAIL"}`);
  console.log("=".repeat(72));

  process.exit(overallPass ? 0 : 1);
}

main().catch((err) => {
  console.error("Stress test crashed:", err);
  process.exit(1);
});
