// @vitest-environment node

import { describe, expect, it } from "vitest";
import { identifier, label, sentenceCase, truncate } from "./slots";

describe("sentenceCase", () => {
  it("capitalises the first word and lowercases the rest", () => {
    expect(sentenceCase("Answer Quality")).toBe("Answer quality");
  });

  it("keeps acronyms, versions, models and code-ish words as written", () => {
    expect(sentenceCase("LLM Execution")).toBe("LLM execution");
    expect(sentenceCase("deploy v2 to GPT-5 via streamText")).toBe(
      "Deploy v2 to GPT-5 via streamText",
    );
  });
});

describe("truncate", () => {
  it("cuts labels at the end and identifiers in the middle", () => {
    expect(truncate("A very long evaluator name", 12)).toBe("A very long…");
    expect(truncate("run-2026-11-17T14:34:24.799Z", 15, "middle")).toBe(
      "run-202…24.799Z",
    );
  });

  it("keeps text that fits, and leaves only the ellipsis at one character", () => {
    expect(truncate("Accuracy", 8)).toBe("Accuracy");
    expect(truncate("Accuracy", 1)).toBe("…");
  });

  it("keeps the full text next to the shown one", () => {
    expect(label("A very long evaluator name", 12)).toEqual({
      text: "A very long…",
      full: "A very long evaluator name",
    });
    expect(identifier("handle-chatbot-message", 22)).toEqual({
      text: "handle-chatbot-message",
      full: "handle-chatbot-message",
    });
  });
});
