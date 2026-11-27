import { describe, expect, it } from "vitest";
import { EvalTargetObject } from "@langfuse/shared";
import {
  getRuleNavigationAction,
  getRuleNavigationUrl,
} from "@/src/features/evals/v2/utils/ruleNavigation";

describe("getRuleNavigationAction", () => {
  it.each([
    [EvalTargetObject.EVENT, true, "edit"],
    [EvalTargetObject.EVENT, false, "edit"],
    [EvalTargetObject.TRACE, true, "remap"],
    [EvalTargetObject.TRACE, false, "peek"],
    [EvalTargetObject.DATASET, true, "remap"],
    [EvalTargetObject.DATASET, false, "peek"],
  ] as const)(
    "routes %s rules with enabled=%s to %s",
    (targetObject, enabled, expected) => {
      expect(getRuleNavigationAction({ targetObject, enabled })).toBe(expected);
    },
  );

  it.each([
    [
      EvalTargetObject.EVENT,
      true,
      "/project/project%2Fid/evals/rules?rule=rule%2Fid",
    ],
    [
      EvalTargetObject.TRACE,
      true,
      "/project/project%2Fid/evals/remap?evaluator=rule%2Fid",
    ],
    [
      EvalTargetObject.TRACE,
      false,
      "/project/project%2Fid/evals/rules?peek=rule%2Fid",
    ],
  ] as const)("builds the %s rule URL", (targetObject, enabled, expected) => {
    expect(
      getRuleNavigationUrl({
        projectId: "project/id",
        ruleId: "rule/id",
        targetObject,
        enabled,
      }),
    ).toBe(expected);
  });
});
