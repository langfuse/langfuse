import {
  EvalTargetObject,
  validateEvaluatorFiltersForTarget,
  type FilterState,
} from "@langfuse/shared";

describe("validateEvaluatorFiltersForTarget", () => {
  it.each([
    {
      targetObject: EvalTargetObject.TRACE,
      filter: [
        {
          type: "string",
          column: "name",
          operator: "=",
          value: "checkout-trace",
        },
      ] satisfies FilterState,
      expectedColumn: "traceName",
    },
    {
      targetObject: EvalTargetObject.DATASET,
      filter: [
        {
          type: "stringOptions",
          column: "Dataset",
          operator: "any of",
          value: ["dataset-1"],
        },
      ] satisfies FilterState,
      expectedColumn: "datasetId",
    },
    {
      targetObject: EvalTargetObject.EVENT,
      filter: [
        {
          type: "stringOptions",
          column: "Trace Name",
          operator: "any of",
          value: ["checkout"],
        },
      ] satisfies FilterState,
      expectedColumn: "traceName",
    },
    {
      targetObject: EvalTargetObject.EXPERIMENT,
      filter: [
        {
          type: "stringOptions",
          column: "Dataset",
          operator: "any of",
          value: ["dataset-1"],
        },
      ] satisfies FilterState,
      expectedColumn: "experimentDatasetId",
    },
  ])(
    "accepts supported filters for $targetObject and normalizes columns",
    ({ targetObject, filter, expectedColumn }) => {
      const result = validateEvaluatorFiltersForTarget({
        targetObject,
        filter,
      });

      expect(result.isValid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.normalizedFilter[0]?.column).toBe(expectedColumn);
    },
  );

  it("rejects unsupported trace-level score filters", () => {
    const result = validateEvaluatorFiltersForTarget({
      targetObject: EvalTargetObject.TRACE,
      filter: [
        {
          type: "numberObject",
          column: "Scores (numeric)",
          key: "accuracy",
          operator: ">",
          value: 0.8,
        },
      ] satisfies FilterState,
    });

    expect(result.isValid).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: "unsupported_column",
      column: "Scores (numeric)",
    });
  });

  it("rejects incompatible filter types", () => {
    const result = validateEvaluatorFiltersForTarget({
      targetObject: EvalTargetObject.EVENT,
      filter: [
        {
          type: "number",
          column: "Environment",
          operator: ">",
          value: 1,
        },
      ] satisfies FilterState,
    });

    expect(result.isValid).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: "incompatible_filter_type",
      normalizedColumn: "environment",
      expectedColumnType: "stringOptions",
    });
  });
});
