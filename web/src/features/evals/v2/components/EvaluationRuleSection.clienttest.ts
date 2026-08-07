import {
  EXAMPLE_FILTERS,
  mergeExampleFilters,
} from "@/src/features/evals/v2/components/EvaluationRuleSection";

describe("evaluator rule examples", () => {
  it("filters experiment observations by their experiment id", () => {
    const experiments = EXAMPLE_FILTERS.find(
      (example) => example.label === "Experiments",
    );

    expect(experiments?.filters).toEqual([
      {
        column: "experimentId",
        type: "null",
        operator: "is not null",
        value: "",
      },
    ]);
    expect(mergeExampleFilters([], experiments?.filters ?? [])).toEqual(
      experiments?.filters,
    );
  });
});
