import { describe, expect, it } from "vitest";
import { BatchEvalSourceTable, EvalTemplateType } from "@langfuse/shared";
import {
  getBatchEvalCostObservationCount,
  getCreateEvaluatorHref,
  hasCompleteBatchEvalMappings,
} from "./utils";

describe("getCreateEvaluatorHref", () => {
  it("links forced-v3 projects to the legacy evaluator UI", () => {
    expect(
      getCreateEvaluatorHref({
        projectId: "project-id",
        forceV3Experience: true,
      }),
    ).toBe("/project/project-id/evals/legacy");
  });

  it("links other projects to the current evaluator gallery", () => {
    expect(
      getCreateEvaluatorHref({
        projectId: "project-id",
        forceV3Experience: false,
      }),
    ).toBe("/project/project-id/evals?gallery=open");
  });
});

describe("getBatchEvalCostObservationCount", () => {
  it("returns the selected observation count for events", () => {
    expect(
      getBatchEvalCostObservationCount({
        displayCount: 12,
        sourceTable: BatchEvalSourceTable.EVENTS,
      }),
    ).toBe(12);
  });

  it("uses the already-expanded observation count for experiment items", () => {
    expect(
      getBatchEvalCostObservationCount({
        displayCount: 12,
        sourceTable: BatchEvalSourceTable.EXPERIMENT_ITEMS,
      }),
    ).toBe(12);
  });

  it("returns null when the observation count is unknown", () => {
    expect(
      getBatchEvalCostObservationCount({
        displayCount: 5,
        sourceTable: BatchEvalSourceTable.EXPERIMENTS,
      }),
    ).toBeNull();
  });
});

describe("hasCompleteBatchEvalMappings", () => {
  it("treats code evaluators as complete without a mapping", () => {
    expect(
      hasCompleteBatchEvalMappings([
        {
          evaluatorType: EvalTemplateType.CODE,
          variableMapping: null,
          defaultVariableMapping: [],
        },
      ]),
    ).toBe(true);
  });

  it("rejects an LLM mapping with an empty source column", () => {
    expect(
      hasCompleteBatchEvalMappings([
        {
          evaluatorType: EvalTemplateType.LLM_AS_JUDGE,
          variableMapping: [
            { templateVariable: "output", selectedColumnId: "" },
          ],
          defaultVariableMapping: [
            { templateVariable: "output", selectedColumnId: "output" },
          ],
        },
      ]),
    ).toBe(false);
  });

  it("accepts inherited mappings that already have source columns", () => {
    expect(
      hasCompleteBatchEvalMappings([
        {
          evaluatorType: EvalTemplateType.LLM_AS_JUDGE,
          variableMapping: null,
          defaultVariableMapping: [
            { templateVariable: "output", selectedColumnId: "output" },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("rejects an empty LLM mapping when the prompt still has variables", () => {
    expect(
      hasCompleteBatchEvalMappings([
        {
          evaluatorType: EvalTemplateType.LLM_AS_JUDGE,
          variableMapping: null,
          defaultVariableMapping: [],
          requiredVariables: ["user_input", "assistant_output"],
        },
      ]),
    ).toBe(false);
  });

  it("accepts an LLM evaluator whose prompt has no variables", () => {
    expect(
      hasCompleteBatchEvalMappings([
        {
          evaluatorType: EvalTemplateType.LLM_AS_JUDGE,
          variableMapping: null,
          defaultVariableMapping: [],
          requiredVariables: [],
        },
      ]),
    ).toBe(true);
  });
});
