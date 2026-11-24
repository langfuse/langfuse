import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectedExperimentComparisonSelect } from "./ConnectedExperimentComparisonSelect";
import { getExperimentColorStyles } from "./table/types";

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
const runs = [
  ["baseline", "Baseline run", "dataset-a"],
  ["comparison", "Comparison run", "dataset-a"],
  ["other", "Other run", "dataset-b"],
] as const;
const searchResults = runs.map(
  ([experimentId, experimentName, datasetId], index) => ({
    experimentId,
    experimentName,
    datasetId,
    datasetName: datasetId,
    startTime: new Date(2026, 0, 3 - index),
  }),
);

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));

vi.mock("@/src/features/experiments/hooks/useExperimentSearch", () => ({
  useExperimentSearch: () => ({
    searchResults,
    availableExperimentNames: searchResults,
    searchQuery: "",
    setSearchQuery: vi.fn(),
    isSearchActive: false,
    isLoading: false,
  }),
}));

describe("ConnectedExperimentComparisonSelect", () => {
  const scrollIntoView = Element.prototype.scrollIntoView;

  beforeEach(() => {
    capture.mockClear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  it("reports opening and selecting once without sending run names or IDs", () => {
    const onSelectedIdsChange = vi.fn();
    render(
      <ConnectedExperimentComparisonSelect
        projectId="project"
        baselineExperimentId="baseline"
        selectedIds={[]}
        colorExperimentIds={["baseline"]}
        selectedExperimentCount={1}
        onSelectedIdsChange={onSelectedIdsChange}
        isAutoSelectEnabled
        onAutoSelectEnabledChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Compare" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    const search = screen.getByPlaceholderText("Search experiments...");
    fireEvent.focus(search);
    fireEvent.click(screen.getByRole("option", { name: /^Comparison run/ }));

    expect(capture.mock.calls).toEqual([
      [
        "experiment:comparison_picker_opened",
        {
          isV4: true,
          tableName: "experiment-items",
          optionCount: 2,
          datasetCount: 2,
          hasSearchQuery: false,
          queryLength: 0,
        },
      ],
      [
        "experiment:comparison_changed",
        {
          isV4: true,
          tableName: "experiment-items",
          comparisonCount: 1,
          isSameDataset: true,
          source: "picker",
        },
      ],
    ]);
    expect(onSelectedIdsChange.mock.calls).toEqual([[["comparison"]]]);

    fireEvent.keyDown(search, { key: "Escape" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(capture).toHaveBeenCalledTimes(3);
    expect(capture.mock.calls[2]?.[0]).toBe(
      "experiment:comparison_picker_opened",
    );
  });

  it("uses the table's marker color and leaves the chip plain without a color order", () => {
    const order = ["baseline", "other", "comparison"];
    const picker = (
      colorExperimentIds: string[],
      baselineExperimentId?: string,
    ) => (
      <ConnectedExperimentComparisonSelect
        projectId="project"
        baselineExperimentId={baselineExperimentId}
        selectedIds={["comparison"]}
        colorExperimentIds={colorExperimentIds}
        selectedExperimentCount={baselineExperimentId ? 2 : 1}
        onSelectedIdsChange={vi.fn()}
        isAutoSelectEnabled
        onAutoSelectEnabledChange={vi.fn()}
      />
    );
    const { rerender } = render(picker(order, "baseline"));
    const marker = () =>
      screen
        .getByRole("button", { name: "Remove Comparison run" })
        .parentElement?.querySelector("span.rounded-full");
    expect(marker()?.className).toContain(
      getExperimentColorStyles("comparison", order).markerClass,
    );

    rerender(picker([]));
    expect(marker()).toBeNull();
  });
});
