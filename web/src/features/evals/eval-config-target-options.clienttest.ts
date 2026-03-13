import { EvalTargetObject } from "@langfuse/shared";
import { resolveCheckboxOperator } from "@/src/features/filters/hooks/useSidebarFilterState";
import { evalConfigFilterColumns } from "@/src/server/api/definitions/evalConfigsTable";

describe("eval config target filter options", () => {
  it("should exclude all non-trace targets when selecting trace", () => {
    const targetColumn = evalConfigFilterColumns.find(
      (col) => col.id === "target",
    );

    expect(targetColumn?.type).toBe("stringOptions");

    const availableValues =
      targetColumn?.type === "stringOptions"
        ? targetColumn.options.map((option) => option.value)
        : [];

    expect(availableValues).toEqual(
      expect.arrayContaining(Object.values(EvalTargetObject)),
    );

    const result = resolveCheckboxOperator({
      colType: "stringOptions",
      existingFilter: undefined,
      values: [EvalTargetObject.TRACE],
      availableValues,
    });

    expect(result).toEqual({
      finalOperator: "none of",
      finalValues: expect.arrayContaining([
        EvalTargetObject.DATASET,
        EvalTargetObject.EVENT,
        EvalTargetObject.EXPERIMENT,
      ]),
    });
  });
});
