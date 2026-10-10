import { describe, expect, it } from "vitest";
import { assertNoEvaluatorResultRuleCycle } from "./assertNoEvaluatorResultRuleCycle";

describe("assertNoEvaluatorResultRuleCycle", () => {
  it("allows evaluator chains", () => {
    expect(() =>
      assertNoEvaluatorResultRuleCycle([
        { sourceEvaluatorId: "a", targetEvaluatorIds: ["b"] },
        { sourceEvaluatorId: "b", targetEvaluatorIds: ["c"] },
      ]),
    ).not.toThrow();
  });

  it("rejects direct and indirect cycles", () => {
    expect(() =>
      assertNoEvaluatorResultRuleCycle([
        { sourceEvaluatorId: "a", targetEvaluatorIds: ["a"] },
      ]),
    ).toThrow("cycle");

    expect(() =>
      assertNoEvaluatorResultRuleCycle([
        { sourceEvaluatorId: "a", targetEvaluatorIds: ["b"] },
        { sourceEvaluatorId: "b", targetEvaluatorIds: ["c"] },
        { sourceEvaluatorId: "c", targetEvaluatorIds: ["a"] },
      ]),
    ).toThrow("cycle");
  });
});
