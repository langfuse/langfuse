import { describe, expect, it } from "vitest";

import { getMonitorPrefill } from "@/src/features/monitors/fns/getMonitorPrefill";

const evaluatorFilters = [
  {
    column: "evaluatorId",
    type: "string",
    operator: "=",
    value: "evaluator-1",
  },
  {
    column: "isEvaluatorTest",
    type: "boolean",
    operator: "=",
    value: false,
  },
];

describe("getMonitorPrefill", () => {
  it.each([
    ["NUMERIC", "scores-numeric"],
    ["BOOLEAN", "scores-boolean"],
    ["CATEGORICAL", "scores-categorical"],
  ] as const)("prefills a %s evaluator score alert", (scoreDataType, view) => {
    expect(
      getMonitorPrefill({
        alert: "evaluatorScore",
        evaluatorId: "evaluator-1",
        scoreDataType,
      }),
    ).toMatchObject({
      view,
      filters: evaluatorFilters,
      window: "1d",
      tags: ["evaluators", "evaluator:evaluator-1"],
      metric:
        scoreDataType === "CATEGORICAL"
          ? { measure: "count", aggregation: "count" }
          : { measure: "value", aggregation: "avg" },
    });
  });

  it("prefills evaluator cost without evaluator test runs", () => {
    expect(
      getMonitorPrefill({
        alert: "evaluatorCost",
        evaluatorId: "evaluator-1",
      }),
    ).toEqual({
      view: "observations",
      filters: evaluatorFilters,
      metric: { measure: "totalCost", aggregation: "sum" },
      tags: ["evaluators", "evaluator:evaluator-1"],
    });
  });

  it("prefills aggregate evaluator cost across current and legacy executions", () => {
    expect(getMonitorPrefill({ alert: "allEvaluatorCost" })).toEqual({
      view: "observations",
      filters: [
        {
          column: "evaluatorId",
          type: "string",
          operator: "is not empty",
          value: "",
        },
        {
          column: "isEvaluatorTest",
          type: "boolean",
          operator: "=",
          value: false,
        },
      ],
      metric: { measure: "totalCost", aggregation: "sum" },
      tags: ["evaluators"],
    });
  });

  it.each([
    {},
    { alert: "unknown" },
    { alert: "evaluatorCost" },
    {
      alert: "evaluatorScore",
      evaluatorId: "evaluator-1",
      scoreDataType: "TEXT",
    },
    {
      alert: ["evaluatorCost"],
      evaluatorId: "evaluator-1",
    },
  ])("ignores invalid query values: %j", (query) => {
    expect(getMonitorPrefill(query)).toBeUndefined();
  });
});
