import { renderHook } from "@testing-library/react";

import { EVALUATOR_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { useSampleObservationFilterOptions } from "./useSampleObservationFilterOptions";

describe("useSampleObservationFilterOptions", () => {
  it("derives query and builder values from the same filter options", () => {
    const { result } = renderHook(() =>
      useSampleObservationFilterOptions({
        datasetOptions: [{ id: "dataset-id", name: "Support tickets" }],
        filterOptions: {
          environment: [
            { value: "langfuse-code-eval" },
            { value: "production" },
          ],
        },
        isFilterOptionsPending: false,
        mapObservedOptions: (observed) => observed,
        activeRegistry: EVALUATOR_FIELD_REGISTRY,
      }),
    );

    expect(
      result.current.searchRegistry.fields
        .find((field) => field.id === "datasetName")
        ?.displayValueByFilterValue?.get("dataset-id"),
    ).toBe("Support tickets");
    expect(result.current.observed?.environment).toEqual([
      { value: "production" },
    ]);
    expect(result.current.observed?.datasetName).toEqual([
      { value: "Support tickets" },
    ]);

    const environmentColumn = result.current.builderColumns.find(
      (column) => column.id === "environment",
    );
    expect(environmentColumn).toMatchObject({
      options: [{ value: "production" }],
    });
    const datasetColumn = result.current.builderColumns.find(
      (column) => column.id === "experimentDatasetId",
    );
    expect(datasetColumn).toMatchObject({
      options: [{ value: "dataset-id", displayValue: "Support tickets" }],
    });
  });
});
