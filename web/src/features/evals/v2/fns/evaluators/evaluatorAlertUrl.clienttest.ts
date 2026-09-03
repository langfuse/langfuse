import { describe, expect, it } from "vitest";

import {
  evaluatorAlertsListUrl,
  evaluatorAlertUrl,
} from "@/src/features/evals/v2/fns/evaluators/evaluatorAlertUrl";

describe("evaluatorAlertUrl", () => {
  it("builds evaluator-specific score and cost alert URLs", () => {
    expect(
      evaluatorAlertUrl("project/1", {
        type: "score",
        evaluatorId: "eval/1",
        scoreDataType: "BOOLEAN",
      }),
    ).toBe(
      "/project/project%2F1/alerts/new?alert=evaluatorScore&evaluatorId=eval%2F1&scoreDataType=BOOLEAN",
    );
    expect(
      evaluatorAlertUrl("project/1", {
        type: "cost",
        evaluatorId: "eval/1",
      }),
    ).toBe(
      "/project/project%2F1/alerts/new?alert=evaluatorCost&evaluatorId=eval%2F1",
    );
  });

  it("builds the all-evaluator spend URL", () => {
    expect(evaluatorAlertUrl("project/1", { type: "allEvaluatorCost" })).toBe(
      "/project/project%2F1/alerts/new?alert=allEvaluatorCost",
    );
  });
});

describe("evaluatorAlertsListUrl", () => {
  it("filters evaluator-specific alerts by evaluator ID", () => {
    expect(evaluatorAlertsListUrl("project/1", "eval/1")).toBe(
      "/project/project%2F1/alerts?filter=evaluatorId%3BstringOptions%3B%3Bany+of%3Beval%252F1",
    );
  });

  it("leaves the all-evaluator alerts list unfiltered", () => {
    expect(evaluatorAlertsListUrl("project/1")).toBe(
      "/project/project%2F1/alerts",
    );
  });
});
