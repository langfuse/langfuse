import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExperimentComparisonSelector } from "./ExperimentComparisonSelector";

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  onSelectedIdsChange: vi.fn(),
  searchQuery: "",
  searchResults: [
    {
      experimentId: "exp-a",
      experimentName: "My Experiment A",
      datasetId: "ds-1",
    },
    {
      experimentId: "exp-b",
      experimentName: "My Experiment B",
      datasetId: "ds-1",
    },
    {
      experimentId: "exp-c",
      experimentName: "My Experiment C",
      datasetId: "ds-2",
    },
  ],
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => h.capture,
}));

vi.mock("@/src/features/experiments/hooks/useExperimentSearch", () => ({
  useExperimentSearch: () => ({
    searchResults: h.searchResults,
    searchQuery: h.searchQuery,
    setSearchQuery: vi.fn(),
    isLoading: false,
    availableExperimentNames: h.searchResults,
  }),
}));

const payload = (call: unknown[]) => (call[1] ?? {}) as Record<string, unknown>;

describe("ExperimentComparisonSelector analytics", () => {
  beforeEach(() => {
    h.capture.mockClear();
    h.onSelectedIdsChange.mockClear();
    h.searchQuery = "";
  });

  it("captures picker open once with option and dataset counts, not search text", () => {
    render(
      <ExperimentComparisonSelector
        projectId="p1"
        baselineExperimentId="exp-a"
        selectedIds={[]}
        selectedExperimentCount={1}
        onSelectedIdsChange={h.onSelectedIdsChange}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText("Search experiments..."));

    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith(
      "experiment:comparison_picker_opened",
      {
        isV4: true,
        tableName: "experiment-items",
        optionCount: 2,
        datasetCount: 2,
        hasSearchQuery: false,
        queryLength: 0,
      },
    );
    expect(JSON.stringify(payload(h.capture.mock.calls[0]))).not.toMatch(
      /My Experiment/,
    );
  });

  it("captures comparison_changed once when a comparison is added", () => {
    render(
      <ExperimentComparisonSelector
        projectId="p1"
        baselineExperimentId="exp-a"
        selectedIds={[]}
        selectedExperimentCount={1}
        onSelectedIdsChange={h.onSelectedIdsChange}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText("Search experiments..."));
    h.capture.mockClear();

    fireEvent.click(screen.getByTitle("My Experiment B"));

    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith("experiment:comparison_changed", {
      isV4: true,
      tableName: "experiment-items",
      comparisonCount: 1,
      isSameDataset: true,
      source: "picker",
    });
    expect(h.onSelectedIdsChange).toHaveBeenCalledWith(["exp-b"]);
    expect(JSON.stringify(payload(h.capture.mock.calls[0]))).not.toMatch(
      /exp-b|My Experiment|ds-1/,
    );
  });
});
