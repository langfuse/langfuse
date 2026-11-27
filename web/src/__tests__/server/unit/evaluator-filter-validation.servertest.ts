import {
  EvalTargetObject,
  TopicsTargetObject,
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
    },
    {
      targetObject: EvalTargetObject.EVENT,
      filter: [
        {
          type: "boolean",
          column: "isExperimentItemRootSpan",
          operator: "=",
          value: true,
        },
      ] satisfies FilterState,
    },
    {
      targetObject: EvalTargetObject.EVENT,
      filter: [
        {
          type: "null",
          column: "experimentId",
          operator: "is not null",
          value: "",
        },
      ] satisfies FilterState,
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
    },
    {
      targetObject: TopicsTargetObject,
      filter: [
        {
          type: "string",
          column: "providedModelName",
          operator: "=",
          value: "gpt-4o",
        },
        {
          type: "string",
          column: "Prompt Name",
          operator: "starts with",
          value: "support",
        },
        {
          type: "string",
          column: "statusMessage",
          operator: "contains",
          value: "rate limit",
        },
        {
          type: "boolean",
          column: "isExperimentItemRootSpan",
          operator: "=",
          value: true,
        },
      ] satisfies FilterState,
    },
  ])(
    "accepts supported filters for $targetObject",
    ({ targetObject, filter }) => {
      const result = validateEvaluatorFiltersForTarget({
        targetObject,
        filter,
      });

      expect(result.isValid).toBe(true);
      expect(result.issues).toEqual([]);
      // Filter columns are passed through as-is (no normalization)
      expect(result.validatedFilters).toEqual(filter);
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
          column: "environment",
          operator: ">",
          value: 1,
        },
      ] satisfies FilterState,
    });

    expect(result.isValid).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: "incompatible_filter_type",
      column: "environment",
      expectedColumnType: "stringOptions",
    });
  });

  it("rejects unsupported trace transcript filters", () => {
    const result = validateEvaluatorFiltersForTarget({
      targetObject: TopicsTargetObject,
      filter: [
        { type: "number", column: "promptVersion", operator: ">", value: 1 },
        {
          type: "string",
          column: "promptName",
          operator: "does not contain",
          value: "support",
        },
        { type: "null", column: "sessionId", operator: "is null", value: "" },
      ] satisfies FilterState,
    });

    expect(result.isValid).toBe(false);
    expect(result.issues.map((issue) => issue.index)).toEqual([0, 1, 2]);
  });
});
