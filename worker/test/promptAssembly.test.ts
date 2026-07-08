import { describe, it, expect } from "vitest";
import {
  buildRehearseSystemPrompt,
  buildVentSystemPrompt,
  buildFeedbackSystemPrompt,
  buildPersonaReminder,
  shouldInjectReminder,
  applyReminderIfDue,
  formatTranscript,
  hasUnfilledPlaceholders,
} from "../src/promptAssembly";
import { TEMPERAMENT_NOTES, DIFFICULTY_RULES } from "../src/prompts.generated";
import type { Persona, ChatMessage } from "../src/types";

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    name: "Diane",
    relationship: "mother",
    temperament: "Guilt-tripping",
    goal: "Set a boundary about weekly calls",
    difficulty: 2,
    scenarioContext: "She calls every day and gets upset when I don't answer.",
    ...overrides,
  };
}

describe("buildRehearseSystemPrompt", () => {
  it("fills every placeholder for every temperament and difficulty combination", () => {
    const temperaments = Object.keys(TEMPERAMENT_NOTES) as Persona["temperament"][];
    const difficulties = Object.keys(DIFFICULTY_RULES).map((d) => Number(d)) as Persona["difficulty"][];

    for (const temperament of temperaments) {
      for (const difficulty of difficulties) {
        const persona = makePersona({ temperament, difficulty });
        const prompt = buildRehearseSystemPrompt(persona);
        expect(hasUnfilledPlaceholders(prompt), `unfilled placeholder for ${temperament}/${difficulty}`).toBe(
          false
        );
        expect(prompt).toContain(persona.name);
        expect(prompt).toContain(persona.relationship);
        expect(prompt).toContain(persona.goal);
      }
    }
  });

  it("throws on an unknown temperament rather than silently emitting a blank", () => {
    const persona = makePersona({ temperament: "Nonexistent" as Persona["temperament"] });
    expect(() => buildRehearseSystemPrompt(persona)).toThrow();
  });

  it("throws on an unknown difficulty", () => {
    const persona = makePersona({ difficulty: 9 as Persona["difficulty"] });
    expect(() => buildRehearseSystemPrompt(persona)).toThrow();
  });

  it("falls back to goal text when scenarioContext is omitted", () => {
    const persona = makePersona({ scenarioContext: undefined });
    const prompt = buildRehearseSystemPrompt(persona);
    expect(prompt).toContain(persona.goal);
    expect(hasUnfilledPlaceholders(prompt)).toBe(false);
  });
});

describe("buildVentSystemPrompt", () => {
  it("has no placeholders (vent-coach prompt takes none)", () => {
    const prompt = buildVentSystemPrompt();
    expect(hasUnfilledPlaceholders(prompt)).toBe(false);
    expect(prompt.length).toBeGreaterThan(100);
  });
});

describe("buildFeedbackSystemPrompt", () => {
  it("fills every placeholder", () => {
    const persona = makePersona();
    const prompt = buildFeedbackSystemPrompt(persona);
    expect(hasUnfilledPlaceholders(prompt)).toBe(false);
    expect(prompt).toContain(persona.name);
    expect(prompt).toContain(persona.relationship);
    expect(prompt).toContain(persona.temperament);
    expect(prompt).toContain(String(persona.difficulty));
    expect(prompt).toContain(persona.goal);
  });
});

describe("buildPersonaReminder", () => {
  it("fills every placeholder in the reminder block", () => {
    const persona = makePersona();
    const reminder = buildPersonaReminder(persona);
    expect(hasUnfilledPlaceholders(reminder)).toBe(false);
    expect(reminder).toContain("<persona_reminder>");
    expect(reminder).toContain(persona.name);
    expect(reminder).toContain(persona.temperament);
    expect(reminder).toContain(String(persona.difficulty));
  });
});

describe("shouldInjectReminder", () => {
  it("fires on turn 8, 16, 24 (multiples of 8, >= 8)", () => {
    expect(shouldInjectReminder(8)).toBe(true);
    expect(shouldInjectReminder(16)).toBe(true);
    expect(shouldInjectReminder(24)).toBe(true);
  });

  it("does not fire on turn 7, 15, or turn 0", () => {
    expect(shouldInjectReminder(7)).toBe(false);
    expect(shouldInjectReminder(15)).toBe(false);
    expect(shouldInjectReminder(0)).toBe(false);
  });

  it("does not fire on turns between multiples of 8", () => {
    for (const t of [1, 2, 3, 4, 5, 6, 9, 10, 17, 23]) {
      expect(shouldInjectReminder(t), `turn ${t}`).toBe(false);
    }
  });
});

describe("applyReminderIfDue", () => {
  const persona = makePersona();
  const messages: ChatMessage[] = [
    { role: "assistant", content: "prior persona reply" },
    { role: "user", content: "the user's latest message" },
  ];

  it("prepends the reminder to the final user message on turn 8, rehearse mode", () => {
    const result = applyReminderIfDue(messages, persona, 8, "rehearse");
    expect(result[1].content.startsWith("<persona_reminder>")).toBe(true);
    expect(result[1].content).toContain("the user's latest message");
    // original array is not mutated
    expect(messages[1].content).toBe("the user's latest message");
  });

  it("does not inject on turn 7", () => {
    const result = applyReminderIfDue(messages, persona, 7, "rehearse");
    expect(result[1].content).toBe("the user's latest message");
  });

  it("does not inject in vent mode even on turn 8", () => {
    const result = applyReminderIfDue(messages, persona, 8, "vent");
    expect(result[1].content).toBe("the user's latest message");
  });

  it("no-ops when there is no user message", () => {
    const assistantOnly: ChatMessage[] = [{ role: "assistant", content: "hi" }];
    const result = applyReminderIfDue(assistantOnly, persona, 8, "rehearse");
    expect(result).toEqual(assistantOnly);
  });
});

describe("formatTranscript", () => {
  it("formats one line per turn as USER: / <PersonaName>:", () => {
    const persona = makePersona({ name: "Diane" });
    const messages: ChatMessage[] = [
      { role: "user", content: "I need to talk about the weekly calls." },
      { role: "assistant", content: "After everything I've done for you?" },
      { role: "user", content: "I still want to talk about it." },
    ];
    const transcript = formatTranscript(messages, persona);
    expect(transcript).toBe(
      [
        "USER: I need to talk about the weekly calls.",
        "Diane: After everything I've done for you?",
        "USER: I still want to talk about it.",
      ].join("\n")
    );
  });

  it("handles an empty transcript", () => {
    expect(formatTranscript([], makePersona())).toBe("");
  });
});
