import { describe, expect, it } from "vitest";

import { isEvalTargetEnvironmentAllowed } from "./isEvalTargetEnvironmentAllowed";

describe("isEvalTargetEnvironmentAllowed", () => {
  it("allows user environments", () => {
    expect(isEvalTargetEnvironmentAllowed("default")).toBe(true);
    expect(isEvalTargetEnvironmentAllowed("production")).toBe(true);
  });

  it("allows missing environments (defaulted downstream)", () => {
    expect(isEvalTargetEnvironmentAllowed(undefined)).toBe(true);
    expect(isEvalTargetEnvironmentAllowed(null)).toBe(true);
  });

  it("blocks eval-on-eval targets across all internal environments", () => {
    for (const environment of [
      "langfuse-llm-as-a-judge",
      "langfuse-code-eval",
      "langfuse-natural-language-filter",
      "langfuse-in-app-agent",
      "langfuse",
    ]) {
      expect(isEvalTargetEnvironmentAllowed(environment)).toBe(false);
    }
  });

  it("allows the sanctioned prompt-experiment targets", () => {
    expect(isEvalTargetEnvironmentAllowed("langfuse-prompt-experiment")).toBe(
      true,
    );
  });
});
