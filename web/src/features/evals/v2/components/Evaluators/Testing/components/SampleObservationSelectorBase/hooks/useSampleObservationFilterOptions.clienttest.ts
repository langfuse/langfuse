import { renderHook } from "@testing-library/react";

import { EVALUATOR_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { useSampleObservationFilterOptions } from "./useSampleObservationFilterOptions";

const { useEventsFilterOptionsMock } = vi.hoisted(() => ({
  useEventsFilterOptionsMock: vi.fn(),
}));

vi.mock("@/src/features/events/hooks/useEventsFilterOptions", () => ({
  useEventsFilterOptions: useEventsFilterOptionsMock,
}));

const refiningFilter = [
  {
    column: "environment",
    type: "stringOptions" as const,
    operator: "any of" as const,
    value: ["production"],
  },
];

describe("useSampleObservationFilterOptions", () => {
  beforeEach(() => {
    useEventsFilterOptionsMock.mockReturnValue({
      filterOptions: {
        environment: [{ value: "langfuse-code-eval" }, { value: "production" }],
        traceTags: [{ value: "customer-facing" }],
      },
      isFilterOptionsPending: false,
    });
  });

  it("derives query and builder values from the same filter options", () => {
    const { result } = renderHook(() =>
      useSampleObservationFilterOptions({
        projectId: "project-id",
        startTimeFilter: [],
        refiningFilter,
        filterMode: "builder",
        datasetOptions: [{ id: "dataset-id", name: "Support tickets" }],
        mapObservedOptions: (observed) => observed,
        activeRegistry: EVALUATOR_FIELD_REGISTRY,
      }),
    );

    expect(useEventsFilterOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refiningFilter,
        lazy: false,
        columns: expect.arrayContaining(["environment", "traceTags"]),
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

    expect(
      result.current.builderColumns.find(
        (column) => column.id === "environment",
      ),
    ).toMatchObject({ options: [{ value: "production" }] });
    expect(
      result.current.builderColumns.find((column) => column.id === "tags"),
    ).toMatchObject({ options: [{ value: "customer-facing" }] });
    expect(
      result.current.builderColumns.find(
        (column) => column.id === "experimentDatasetId",
      ),
    ).toMatchObject({
      options: [{ value: "dataset-id", displayValue: "Support tickets" }],
    });
  });
});
