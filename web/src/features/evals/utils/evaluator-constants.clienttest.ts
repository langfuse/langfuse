vi.mock("@langfuse/shared", () => ({
  LangfuseInternalTraceEnvironment: {
    CodeEval: "langfuse-code-eval",
    LLMJudge: "langfuse-llm-as-a-judge",
  },
  observationEvalVariableColumns: [],
}));

import {
  DEFAULT_OBSERVATION_FILTER,
  filterSelectableEvalEnvironmentOptions,
  isHiddenEvalEnvironment,
} from "@/src/features/evals/utils/evaluator-constants";

describe("evaluator environment filter constants", () => {
  it("hides internal evaluator environment options", () => {
    expect(isHiddenEvalEnvironment("langfuse-llm-as-a-judge")).toBe(true);
    expect(isHiddenEvalEnvironment("langfuse-code-eval")).toBe(true);
    expect(isHiddenEvalEnvironment("langfuse-new-internal-env")).toBe(true);
    expect(isHiddenEvalEnvironment("sdk-experiment")).toBe(true);
    expect(isHiddenEvalEnvironment("langfuse")).toBe(false);
    expect(isHiddenEvalEnvironment("production")).toBe(false);
  });

  it("filters hidden environments out of selectable eval options", () => {
    expect(
      filterSelectableEvalEnvironmentOptions([
        { value: "production" },
        { value: "langfuse-evaluation" },
        { value: "sdk-experiment" },
        { value: "staging" },
      ]),
    ).toEqual([{ value: "production" }, { value: "staging" }]);
  });

  it("does not add an environment filter by default for observation evaluators", () => {
    expect(
      DEFAULT_OBSERVATION_FILTER.some(
        (filter) => filter.column === "environment",
      ),
    ).toBe(false);
  });
});
