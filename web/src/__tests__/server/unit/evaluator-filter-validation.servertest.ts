import {
  EvalTargetObject,
  mapEventEvalFilterColumnIdToField,
  validateEvaluatorFiltersForTarget,
  type FilterState,
  type ObservationForEval,
} from "@langfuse/shared";

describe("validateEvaluatorFiltersForTarget", () => {
  it.each([EvalTargetObject.EVENT, EvalTargetObject.TRACE])(
    "normalizes status to the stored level column for %s rules",
    (targetObject) => {
      const filter = [
        {
          type: "stringOptions",
          column: "status",
          operator: "any of",
          value: ["ERROR"],
        },
      ] satisfies FilterState;
      const result = validateEvaluatorFiltersForTarget({
        targetObject,
        filter,
      });

      expect(result.isValid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.validatedFilters).toEqual([
        { ...filter[0], column: "level" },
      ]);
      expect(filter[0].column).toBe("status");
      if (targetObject === EvalTargetObject.EVENT) {
        expect(
          mapEventEvalFilterColumnIdToField(
            { level: "ERROR" } as ObservationForEval,
            result.validatedFilters[0].column,
          ),
        ).toBe("ERROR");
      }
    },
  );

  it.each([EvalTargetObject.DATASET, EvalTargetObject.EXPERIMENT])(
    "keeps status unavailable for %s rules",
    (targetObject) => {
      const result = validateEvaluatorFiltersForTarget({
        targetObject,
        filter: [
          {
            type: "stringOptions",
            column: "status",
            operator: "any of",
            value: ["ERROR"],
          },
        ] satisfies FilterState,
      });

      expect(result.isValid).toBe(false);
      expect(result.issues[0]).toMatchObject({
        code: "unsupported_column",
        column: "status",
      });
    },
  );

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
  ])(
    "accepts supported filters for $targetObject",
    ({ targetObject, filter }) => {
      const result = validateEvaluatorFiltersForTarget({
        targetObject,
        filter,
      });

      expect(result.isValid).toBe(true);
      expect(result.issues).toEqual([]);
      // Existing filter spellings keep their stored representation.
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
});
