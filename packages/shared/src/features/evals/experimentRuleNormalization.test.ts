import { describe, expect, it } from "vitest";
import {
  ensureExperimentRootFilter,
  isExperimentEvaluationRule,
  normalizeEvaluationRuleTarget,
} from "./experimentRuleNormalization";
import { EvalTargetObject } from "./types";

const datasetFilter = {
  type: "stringOptions" as const,
  column: "experimentDatasetId",
  operator: "any of" as const,
  value: ["dataset-id"],
};

describe("experiment rule normalization", () => {
  it("normalizes the legacy experiment target to the canonical event representation", () => {
    expect(
      normalizeEvaluationRuleTarget({
        targetObject: EvalTargetObject.EXPERIMENT,
        filter: [datasetFilter],
      }),
    ).toEqual({
      targetObject: EvalTargetObject.EVENT,
      filter: [
        datasetFilter,
        {
          type: "boolean",
          column: "isExperimentItemRootSpan",
          operator: "=",
          value: true,
        },
      ],
    });
  });

  it("recognizes either experiment representation", () => {
    expect(
      isExperimentEvaluationRule({
        targetObject: EvalTargetObject.EXPERIMENT,
        filter: [],
      }),
    ).toBe(true);
    expect(
      isExperimentEvaluationRule({
        targetObject: EvalTargetObject.EVENT,
        filter: ensureExperimentRootFilter([]),
      }),
    ).toBe(true);
  });

  it("replaces duplicate or conflicting root filters idempotently", () => {
    const filter = [
      datasetFilter,
      {
        type: "boolean" as const,
        column: "isExperimentItemRootSpan",
        operator: "<>" as const,
        value: false,
      },
      {
        type: "boolean" as const,
        column: "isExperimentItemRootSpan",
        operator: "=" as const,
        value: true,
      },
    ];

    const normalized = ensureExperimentRootFilter(filter);
    expect(normalized).toEqual([
      datasetFilter,
      {
        type: "boolean",
        column: "isExperimentItemRootSpan",
        operator: "=",
        value: true,
      },
    ]);
    expect(ensureExperimentRootFilter(normalized)).toEqual(normalized);
  });
});
