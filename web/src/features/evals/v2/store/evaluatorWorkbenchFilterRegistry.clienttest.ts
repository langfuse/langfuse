import {
  applyEvaluatorWorkbenchFilter,
  registerEvaluatorWorkbenchFilter,
} from "./evaluatorWorkbenchFilterRegistry";

const filter = [
  {
    type: "stringOptions" as const,
    column: "type",
    operator: "any of" as const,
    value: ["GENERATION"],
  },
];

describe("evaluatorWorkbenchFilterRegistry", () => {
  it("applies filters only to the matching project and evaluator", () => {
    const apply = vi.fn();
    const unregister = registerEvaluatorWorkbenchFilter(
      "project-1",
      "evaluator-1",
      apply,
    );

    expect(
      applyEvaluatorWorkbenchFilter("project-1", "evaluator-1", filter),
    ).toBe(true);
    expect(apply).toHaveBeenCalledWith(filter);
    expect(
      applyEvaluatorWorkbenchFilter("project-2", "evaluator-1", filter),
    ).toBe(false);
    expect(
      applyEvaluatorWorkbenchFilter("project-1", "evaluator-2", filter),
    ).toBe(false);

    unregister();
    expect(
      applyEvaluatorWorkbenchFilter("project-1", "evaluator-1", filter),
    ).toBe(false);
  });
});
