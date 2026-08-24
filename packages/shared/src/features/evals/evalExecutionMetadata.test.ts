import { describe, expect, it } from "vitest";
import { getEvalExecutionMetadata } from "./evalExecutionMetadata";

describe("getEvalExecutionMetadata", () => {
  it("derives evaluator and rule identifiers from current metadata", () => {
    expect(
      getEvalExecutionMetadata({
        evaluator_id: "evaluator-1",
        evaluation_rule_id: "rule-1",
        job_configuration_id: "legacy-rule",
      }),
    ).toEqual({
      evaluatorId: "evaluator-1",
      ruleId: "rule-1",
      evaluatorExecutionIsTest: false,
    });
  });

  it("uses the legacy job configuration identifier only as the rule identifier", () => {
    expect(
      getEvalExecutionMetadata({
        job_configuration_id: "legacy-rule",
      }),
    ).toEqual({
      evaluatorId: "",
      ruleId: "legacy-rule",
      evaluatorExecutionIsTest: false,
    });
  });

  it("returns empty identifiers for unrelated metadata", () => {
    expect(getEvalExecutionMetadata({ source: "annotation" })).toEqual({
      evaluatorId: "",
      ruleId: "",
      evaluatorExecutionIsTest: false,
    });
  });

  it("identifies evaluator test executions from string and boolean metadata", () => {
    expect(
      getEvalExecutionMetadata({ evaluator_test: "true" })
        .evaluatorExecutionIsTest,
    ).toBe(true);
    expect(
      getEvalExecutionMetadata({ evaluator_test: true })
        .evaluatorExecutionIsTest,
    ).toBe(true);
    expect(
      getEvalExecutionMetadata({ evaluator_test: "false" })
        .evaluatorExecutionIsTest,
    ).toBe(false);
  });
});
