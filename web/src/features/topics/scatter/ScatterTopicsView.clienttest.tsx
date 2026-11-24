import { type ReactNode, useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type FilterState } from "@langfuse/shared";
import { type Facet, type TopicTraceQuery, type TopicTracesResult } from "../facet-topics";
import { ScatterTopicsView } from "./ScatterTopicsView";

const routerState = vi.hoisted(() => ({
  peek: undefined as string | undefined,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: routerState.peek ? { peek: routerState.peek } : {},
  }),
}));

vi.mock("react-responsive", () => ({
  useMediaQuery: () => true,
}));

vi.mock("@/src/components/ui/resizable", () => ({
  useDefaultLayout: () => ({
    defaultLayout: undefined,
    onLayoutChanged: () => undefined,
  }),
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResizablePanel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResizableHandle: () => null,
}));

vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: true }),
}));

vi.mock("../useTopicsCapture", () => ({
  useTopicsCapture: () => vi.fn(),
}));

vi.mock("../useTopicTraceFilter", () => ({
  useTopicResultsTraceSuggestions: () => ({
    observed: {},
    onRequestColumns: vi.fn(),
    erroredColumns: new Set<string>(),
  }),
}));

vi.mock("../TopicsTraceToolbar", () => ({
  TopicsTraceToolbar: () => null,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      mapMatches: {
        useQuery: () => ({ data: undefined, isError: false, error: null }),
      },
    },
  },
}));

vi.mock("./ScatterMap", () => ({
  ScatterMap: ({
    selectedTraceId,
    onSelectTrace,
  }: {
    selectedTraceId: string | null;
    onSelectTrace: (traceId: string | null) => void;
  }) => (
    <div data-testid="scatter-map" data-selected-trace={selectedTraceId ?? ""}>
      <button type="button" onClick={() => onSelectTrace("trace-1")}>
        Dot trace-1
      </button>
      <button type="button" onClick={() => onSelectTrace("trace-unloaded")}>
        Dot trace-unloaded
      </button>
      <button type="button" onClick={() => onSelectTrace(null)}>
        Empty map
      </button>
    </div>
  ),
}));

const facet = {
  facetId: "intent",
  name: "Intent",
  window: {
    from: new Date("2026-10-01T00:00:00Z"),
    to: new Date("2026-10-08T00:00:00Z"),
  },
  counts: { total: 3, assigned: 3, outlier: 0, awaiting: 0 },
  topics: [
    {
      id: "billing",
      name: "Billing",
      description: "Billing questions",
      count: 3,
    },
  ],
  map: {
    runId: "run-1",
    topics: [{ id: "billing", name: "Billing", description: "Billing questions" }],
  },
} as unknown as Facet;

const mapResult = {
  data: {
    status: "ready" as const,
    reason: null,
    points: [
      {
        traceId: "trace-1",
        summary: "Invoice question",
        unitStartTime: "2026-10-05T00:00:00Z",
        topicId: "billing",
        outcome: "assigned" as const,
        x: 0,
        y: 0,
      },
      {
        traceId: "trace-2",
        summary: "Refund question",
        unitStartTime: "2026-10-04T00:00:00Z",
        topicId: "billing",
        outcome: "assigned" as const,
        x: 1,
        y: 1,
      },
      {
        traceId: "trace-unloaded",
        summary: "Older invoice trace",
        unitStartTime: "2026-10-02T00:00:00Z",
        topicId: "billing",
        outcome: "assigned" as const,
        x: 2,
        y: 0,
      },
    ],
    missingSummaryCount: 0,
    unpositionedCount: 0,
  },
  error: null,
};

const rowsById = new Map(
  mapResult.data.points.map((point) => [
    point.traceId,
    {
      traceId: point.traceId,
      unitStartTime: point.unitStartTime,
      facetVersion: 1,
      summary: point.summary,
      outcome: "assigned" as const,
      topicId: point.topicId,
      topicName: "Billing",
    },
  ]),
);

function useFakeTraces(query: TopicTraceQuery | null): TopicTracesResult {
  if (query === null) {
    return {
      rows: [],
      isLoading: false,
      isLoadingMore: false,
      error: null,
      hasMore: false,
      loadMore: () => undefined,
    };
  }
  let rows = [rowsById.get("trace-1")!, rowsById.get("trace-2")!];
  if (query.traceId) {
    const match = rowsById.get(query.traceId);
    rows = match ? [match] : [];
  }
  return {
    rows,
    isLoading: false,
    isLoadingMore: false,
    error: null,
    hasMore: false,
    loadMore: () => undefined,
  };
}

function Harness({
  openPeek,
  initialFilters = [],
}: {
  openPeek: (id?: string) => void;
  initialFilters?: FilterState;
}) {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  return (
    <ScatterTopicsView
      projectId="project-1"
      facet={facet}
      mapResult={mapResult}
      traceFilters={{
        selectedFacetId: "intent",
        selectFacet: vi.fn(),
        filters,
        setFilters,
        searchQuery,
        setSearchQuery,
      }}
      showUnassigned
      peekView={{
        itemType: "TRACE",
        tableName: "topics-traces",
        isV4: true,
        openPeek,
        closePeek: vi.fn(),
      }}
      useTraces={useFakeTraces}
    />
  );
}

beforeEach(() => {
  routerState.peek = undefined;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [
            {
              target,
              contentRect: { width: 640, height: 400 } as DOMRectReadOnly,
            } as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("highlights a trace clicked on the scatter plot in the trace list without opening peek, and opens peek only when clicking the trace row", () => {
  const openPeek = vi.fn();
  render(<Harness openPeek={openPeek} />);

  fireEvent.click(screen.getByRole("button", { name: "Dot trace-1" }));

  expect(openPeek).not.toHaveBeenCalled();
  expect(screen.getByTestId("scatter-map")).toHaveAttribute(
    "data-selected-trace",
    "trace-1",
  );
  const trace1Row = screen.getByText("trace-1").closest("tr");
  const trace2Row = screen.getByText("trace-2").closest("tr");
  expect(trace1Row).toHaveAttribute("aria-selected", "true");
  expect(trace2Row).not.toHaveAttribute("aria-selected", "true");

  // Clicking a different trace row in the trace list opens peek and drops the previous scatter highlight.
  fireEvent.click(trace2Row!);
  expect(openPeek).toHaveBeenCalledWith(
    "trace-2",
    expect.objectContaining({ id: "trace-2" }),
  );
  expect(trace1Row).not.toHaveAttribute("aria-selected", "true");

  // A dot from outside the loaded pages is fetched, pinned, and highlighted without opening peek;
  // clicking that row in the trace list opens its peek.
  openPeek.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Dot trace-unloaded" }));
  expect(openPeek).not.toHaveBeenCalled();
  const unloadedRow = screen.getByText("trace-unloaded").closest("tr");
  expect(unloadedRow).toHaveAttribute("aria-selected", "true");

  fireEvent.click(unloadedRow!);
  expect(openPeek).toHaveBeenCalledWith(
    "trace-unloaded",
    expect.objectContaining({ id: "trace-unloaded" }),
  );
});

it("prefers a newly clicked scatter trace over a still-closing peek query param", () => {
  routerState.peek = "trace-2";
  const openPeek = vi.fn();
  render(<Harness openPeek={openPeek} />);

  expect(screen.getByTestId("scatter-map")).toHaveAttribute(
    "data-selected-trace",
    "trace-2",
  );

  fireEvent.click(screen.getByRole("button", { name: "Dot trace-1" }));
  expect(openPeek).not.toHaveBeenCalled();
  expect(screen.getByTestId("scatter-map")).toHaveAttribute(
    "data-selected-trace",
    "trace-1",
  );
  expect(screen.getByText("trace-1").closest("tr")).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

it("clears the highlighted trace before clearing a picked topic when clicking empty map space", () => {
  const openPeek = vi.fn();
  render(
    <Harness
      openPeek={openPeek}
      initialFilters={[
        {
          column: "topicId",
          type: "stringOptions",
          operator: "any of",
          value: ["billing"],
        },
      ]}
    />,
  );

  const tracePanel = screen.getByRole("region", { name: "Topic traces" });
  expect(within(tracePanel).getByRole("heading", { name: "Billing" })).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Dot trace-1" }));
  expect(screen.getByText("trace-1").closest("tr")).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // First empty click deselects the trace while keeping the picked topic.
  fireEvent.click(screen.getByRole("button", { name: "Empty map" }));
  expect(screen.getByText("trace-1").closest("tr")).not.toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(within(tracePanel).getByRole("heading", { name: "Billing" })).toBeVisible();

  // Second empty click clears the picked topic.
  fireEvent.click(screen.getByRole("button", { name: "Empty map" }));
  expect(
    within(screen.getByRole("region", { name: "Topic traces" })).getByRole(
      "heading",
      { name: "All traces" },
    ),
  ).toBeVisible();
});
