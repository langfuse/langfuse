import { describe, expect, it } from "vitest";

import { getEvaluatorAssistantPrompt } from "./getEvaluatorAssistantPrompt";

describe("getEvaluatorAssistantPrompt", () => {
  it("requires the three intake decisions before tools are used", () => {
    const prompt = getEvaluatorAssistantPrompt({
      evaluatorId: "evaluator-id",
      mode: "edit",
    });

    expect(prompt).toContain("what should be evaluated");
    expect(prompt).toContain("which model");
    expect(prompt).toContain("which data");
    expect(prompt).toContain("Do not call tools");
    expect(prompt).toContain('evaluator ID "evaluator-id"');
  });

  it("instructs creation only after intake for a new evaluator", () => {
    const prompt = getEvaluatorAssistantPrompt({
      evaluatorId: null,
      mode: "create",
    });

    expect(prompt).toContain("createEvaluator");
    expect(prompt).toContain("after intake is complete");
  });
});
