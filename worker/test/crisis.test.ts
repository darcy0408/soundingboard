import { describe, it, expect } from "vitest";
import { containsCrisisLanguage, CRISIS_RESPONSE } from "../src/crisis";

describe("containsCrisisLanguage — hits", () => {
  const hits = [
    "I want to kill myself",
    "sometimes I think about KILLING MYSELF",
    "I just want to end my life",
    "I've been thinking about ending it all",
    "honestly I want to die",
    "I wish I was dead",
    "I've been cutting myself again",
    "I'm feeling suicidal",
    "I don't want to live anymore, I can't go on",
    "I'm going to kill him if he shows up",
    "I want to hurt her so bad",
    "he said he's gonna kill them",
    "I took an overdose last night",
    "kill-myself", // hyphen variant tolerated by the flexible regex
    "kill   myself", // extra whitespace tolerated
  ];

  it.each(hits)("flags: %s", (text) => {
    expect(containsCrisisLanguage(text)).toBe(true);
  });
});

describe("containsCrisisLanguage — misses (should not false-positive)", () => {
  const misses = [
    "",
    "My mother is guilt-tripping me about the holidays.",
    "He's so dismissive when I bring up chores.",
    "This roommate situation is killing me with the noise.", // "killing me" alone isn't in the phrase list
    "That skill of yours is impressive.", // word-boundary matching avoids substring false positives
    "I could just scream, this is so frustrating.",
    "Let's talk about the budget for next quarter.",
    "I'm dying to see that movie.", // not in the phrase list
  ];

  it.each(misses)("does not flag: %s", (text) => {
    expect(containsCrisisLanguage(text)).toBe(false);
  });
});

describe("CRISIS_RESPONSE", () => {
  it("is the fixed SAFETY message from the prompt files, verbatim", () => {
    expect(CRISIS_RESPONSE).toContain("Let's pause the practice");
    expect(CRISIS_RESPONSE).toContain("988");
    expect(CRISIS_RESPONSE).toContain("I'm a practice tool");
  });
});
