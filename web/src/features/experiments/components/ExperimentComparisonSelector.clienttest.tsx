import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { ExperimentComparisonSelector } from "./ExperimentComparisonSelector";
import { ExperimentScoreMatrix } from "./table/ExperimentScoreMatrix";
import {
  getExperimentColorStyles,
  type ExperimentItemsTableRow,
} from "./table/types";

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  onSelectedIdsChange: vi.fn(),
  searchQuery: "",
  onAutoSelectEnabledChange: vi.fn(),
  // Newest first, the order the picker's own query returns. `startTime` and
  // `datasetName` came with the dataset grouping and recency ordering.
  searchResults: [
    {
      experimentId: "exp-a",
      experimentName: "My Experiment A",
      datasetId: "ds-1",
      datasetName: "My Dataset One",
      startTime: new Date("2026-08-26T10:00:00Z"),
    },
    {
      experimentId: "exp-b",
      experimentName: "My Experiment B",
      datasetId: "ds-1",
      datasetName: "My Dataset One",
      startTime: new Date("2026-08-25T10:00:00Z"),
    },
    {
      experimentId: "exp-c",
      experimentName: "My Experiment C",
      datasetId: "ds-2",
      datasetName: "My Dataset Two",
      startTime: new Date("2026-08-24T10:00:00Z"),
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
    isSearchActive: false,
    isLoading: false,
    availableExperimentNames: h.searchResults,
  }),
}));

const payload = (call: unknown[]) => (call[1] ?? {}) as Record<string, unknown>;

describe("ExperimentComparisonSelector analytics", () => {
  beforeEach(() => {
    h.capture.mockClear();
    h.onSelectedIdsChange.mockClear();
    h.onAutoSelectEnabledChange.mockClear();
    h.searchQuery = "";
  });

  it("captures picker open once with option and dataset counts, not search text", () => {
    render(
      <ExperimentComparisonSelector
        projectId="p1"
        baselineExperimentId="exp-a"
        selectedIds={[]}
        colorExperimentIds={[]}
        selectedExperimentCount={1}
        onSelectedIdsChange={h.onSelectedIdsChange}
        isAutoSelectEnabled={true}
        onAutoSelectEnabledChange={h.onAutoSelectEnabledChange}
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
        colorExperimentIds={[]}
        selectedExperimentCount={1}
        onSelectedIdsChange={h.onSelectedIdsChange}
        isAutoSelectEnabled={true}
        onAutoSelectEnabledChange={h.onAutoSelectEnabledChange}
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

// The invariant: every surface that paints a run's colour resolves it from the
// one order the selection publishes, so the run pickers and the layouts agree
// in every layout, with and without a baseline. The matrix stands in for the
// layouts here: it is the one that reached the colour through its own list.
describe("run colours agree across surfaces", () => {
  const scoreKey = "groundedness-EVAL-NUMERIC";
  const matrixColumns = h.searchResults.map((experiment, index) => ({
    experimentId: experiment.experimentId,
    experimentName: experiment.experimentName,
    isBaseline: index === 0,
  }));
  const matrixRows = [
    {
      id: "item-1",
      experiments: matrixColumns.map((column) => ({
        experimentId: column.experimentId,
        traceScores: { [scoreKey]: { type: "NUMERIC", average: 0.5 } },
      })),
    },
  ] as unknown as ExperimentItemsTableRow[];

  const renderChips = (colorExperimentIds: string[]) =>
    render(
      <ExperimentComparisonSelector
        projectId="p1"
        baselineExperimentId="exp-a"
        selectedIds={["exp-b", "exp-c"]}
        colorExperimentIds={colorExperimentIds}
        selectedExperimentCount={3}
        onSelectedIdsChange={h.onSelectedIdsChange}
        isAutoSelectEnabled={true}
        onAutoSelectEnabledChange={h.onAutoSelectEnabledChange}
      />,
    ).container;

  const renderMatrix = (colorExperimentIds: string[]) =>
    render(
      <TooltipProvider>
        <ExperimentScoreMatrix
          rows={matrixRows}
          scoreRows={[
            {
              scoreKey,
              level: "trace",
              dataType: "NUMERIC",
              label: "# groundedness",
            },
          ]}
          experiments={matrixColumns}
          colorExperimentIds={colorExperimentIds}
          isLoading={false}
          pagination={{
            totalCount: 1,
            onChange: vi.fn(),
            state: { pageIndex: 0, pageSize: 50 },
          }}
        />
      </TooltipProvider>,
    ).container;

  const markerOf = (container: HTMLElement, experimentName: string) =>
    within(container)
      .getByText(experimentName)
      .parentElement?.querySelector("span.rounded-full");

  it("gives a run the same colour in the pickers and in the matrix", () => {
    // Baseline first, then the comparisons in selection order — the list the
    // table's cells index into.
    const colorExperimentIds = ["exp-a", "exp-b", "exp-c"];
    const chips = renderChips(colorExperimentIds);
    const matrix = renderMatrix(colorExperimentIds);

    for (const [id, name] of [
      ["exp-b", "My Experiment B"],
      ["exp-c", "My Experiment C"],
    ]) {
      const expected = getExperimentColorStyles(
        id,
        colorExperimentIds,
      ).markerClass;
      expect(markerOf(chips, name)?.className).toContain(expected);
      expect(markerOf(matrix, name)?.className).toContain(expected);
    }
    expect(markerOf(matrix, "My Experiment B")?.className).not.toEqual(
      markerOf(matrix, "My Experiment C")?.className,
    );
  });

  it("stays plain everywhere with no baseline to colour against", () => {
    const chips = renderChips([]);
    const matrix = renderMatrix([]);

    for (const name of ["My Experiment B", "My Experiment C"]) {
      expect(markerOf(chips, name)).toBeNull();
      expect(markerOf(matrix, name)).toBeNull();
      // The colour goes, the run does not: a column keeps its name.
      expect(within(matrix).getByText(name)).toBeTruthy();
    }
  });
});
