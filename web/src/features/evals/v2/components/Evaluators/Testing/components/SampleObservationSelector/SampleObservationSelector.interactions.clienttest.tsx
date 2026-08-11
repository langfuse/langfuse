import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import type { FilterState } from "@langfuse/shared";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { SampleObservationSelector } from "./SampleObservationSelector";

const {
  observation,
  eventsAllInputsSpy,
  eventsSearchBarRowSpy,
  useEventsSearchBarSpy,
} = vi.hoisted(() => ({
  observation: {
    id: "observation-1",
    traceId: "trace-1",
    name: "answer",
    startTime: new Date("2026-08-10T10:00:00.000Z"),
    metadata: { region: "eu" },
  },
  eventsAllInputsSpy: vi.fn(),
  eventsSearchBarRowSpy: vi.fn(),
  useEventsSearchBarSpy: vi.fn(),
}));

vi.mock("@/src/components/table/data-table", () => ({
  DataTable: ({
    columns,
    data,
    onScroll,
    onRowClick,
  }: {
    columns: Array<{
      header: ReactNode | (() => ReactNode);
      cell: (props: { row: { original: typeof observation } }) => ReactNode;
    }>;
    data: { data?: (typeof observation)[] };
    onScroll?: React.UIEventHandler<HTMLDivElement>;
    onRowClick: (row: typeof observation) => void;
  }) => {
    const observation = data.data?.[0];
    const sampleColumn = columns[0]!;

    return observation ? (
      <div data-testid="sample-table-scroll" onScroll={onScroll}>
        {columns.map((column, index) => (
          <span key={index}>
            {typeof column.header === "function"
              ? column.header()
              : column.header}
          </span>
        ))}
        <button type="button" onClick={() => onRowClick(observation)}>
          Open trace
        </button>
        {sampleColumn.cell({ row: { original: observation } })}
      </div>
    ) : null;
  },
}));

vi.mock("@/src/components/table/data-table-column-visibility-filter", () => ({
  DataTableColumnVisibilityFilter: () => null,
}));
vi.mock("@/src/components/table/data-table-row-height-switch", () => ({
  useRowHeightLocalStorage: () => ["s"],
}));
vi.mock("@/src/features/events/hooks/useEventsFilterOptions", () => ({
  useEventsFilterOptions: () => ({
    filterOptions: {
      environment: [{ value: "production", count: 1 }],
      scores_avg: [{ value: "accuracy", count: 1 }],
    },
    isFilterOptionsPending: false,
    erroredColumns: [],
    requestColumns: vi.fn(),
  }),
}));
vi.mock("@/src/features/search-bar/components/EventsSearchBarRow", () => ({
  EventsSearchBarRow: (props: unknown) => {
    eventsSearchBarRowSpy(props);
    return null;
  },
}));
vi.mock("@/src/features/search-bar/hooks/useEventsSearchBar", () => ({
  useEventsSearchBar: (args: unknown) => {
    useEventsSearchBarSpy(args);
    return {
      store: {},
      commit: vi.fn(),
      applyFilters: vi.fn(),
    };
  },
}));
vi.mock("@/src/features/column-visibility/hooks/useColumnOrder", () => ({
  default: () => [[], vi.fn()],
}));
vi.mock("@/src/features/column-visibility/hooks/useColumnVisibility", () => ({
  default: () => [{}, vi.fn()],
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useQueries: (buildQueries: (t: unknown) => unknown[]) =>
      buildQueries({
        events: {
          all: (input: { filter: FilterState; page: number }) => {
            eventsAllInputsSpy(input);
            const observations =
              input.filter.length === 0 && input.page === 1
                ? [observation]
                : [];
            return {
              isPending: false,
              isError: false,
              isFetching: false,
              status: "success",
              data: {
                observations,
                hasMore: input.filter.length === 0 && input.page === 1,
              },
            };
          },
          batchIO: () => ({
            isPending: false,
            data: [
              {
                id: observation.id,
                input: { question: "Why?" },
                output: "Because",
                metadata: observation.metadata,
              },
            ],
          }),
        },
      }),
    events: {
      countAll: {
        useQuery: () => ({ data: { totalCount: 1 } }),
      },
    },
  },
  sendAsPostOption: {},
}));

describe("SampleObservationSelector interactions", () => {
  beforeEach(() => {
    eventsAllInputsSpy.mockClear();
  });

  it("selects the first matching observation by default", () => {
    const onSelect = vi.fn();

    render(
      <TooltipProvider>
        <SampleObservationSelector
          projectId="project-1"
          timeRange={null}
          selectedObservationId={null}
          onSelect={onSelect}
          onOpenTrace={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(onSelect).toHaveBeenCalledWith(observation);
  });

  it("labels sample selection separately from opening the row's trace", () => {
    const onSelect = vi.fn();
    const onOpenTrace = vi.fn();

    render(
      <TooltipProvider>
        <SampleObservationSelector
          projectId="project-1"
          timeRange={null}
          selectedObservationId={null}
          onSelect={onSelect}
          onOpenTrace={onOpenTrace}
        />
      </TooltipProvider>,
    );

    const accessibleHeader = screen.getByText("Sample");
    expect(accessibleHeader).toHaveClass("sr-only");
    expect(accessibleHeader.previousElementSibling).toHaveClass("lucide-star");
    onSelect.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Open trace" }));
    expect(onOpenTrace).toHaveBeenCalledWith(observation);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Use answer as sample" }),
    );
    expect(onSelect).toHaveBeenCalledWith(observation);
  });

  it("shows input, output, and metadata columns", () => {
    render(
      <TooltipProvider>
        <SampleObservationSelector
          projectId="project-1"
          timeRange={null}
          selectedObservationId={observation.id}
          onSelect={vi.fn()}
          onOpenTrace={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText("Metadata")).toBeInTheDocument();
  });

  it("filters the tools example to tool observations", () => {
    render(
      <TooltipProvider>
        <SampleObservationSelector
          projectId="project-1"
          timeRange={null}
          selectedObservationId={observation.id}
          onSelect={vi.fn()}
          onOpenTrace={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tools" }));

    expect(useEventsSearchBarSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filterState: [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["TOOL"],
          },
        ],
      }),
    );
  });

  it("clears the selected sample when filters have no matches", () => {
    const onSelect = vi.fn();

    render(
      <TooltipProvider>
        <SampleObservationSelector
          projectId="project-1"
          timeRange={null}
          selectedObservationId={observation.id}
          onSelect={onSelect}
          onOpenTrace={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tools" }));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("uses the complete Events search and AI context without a field registry", () => {
    render(
      <TooltipProvider>
        <SampleObservationSelector
          projectId="project-1"
          timeRange={null}
          selectedObservationId={null}
          onSelect={vi.fn()}
          onOpenTrace={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(useEventsSearchBarSpy).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ fieldRegistry: expect.anything() }),
    );
    expect(eventsSearchBarRowSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        aiDataContext: expect.stringContaining("metadata.region"),
        aiScoreNames: expect.objectContaining({ numeric: ["accuracy"] }),
        onRequestColumns: expect.any(Function),
      }),
    );
    expect(eventsSearchBarRowSpy.mock.lastCall?.[0]).not.toHaveProperty(
      "fieldReason",
    );
    expect(eventsSearchBarRowSpy.mock.lastCall?.[0]).not.toHaveProperty(
      "fieldRegistry",
    );

    const searchArgs = useEventsSearchBarSpy.mock.lastCall?.[0] as {
      setFilterState: (filters: FilterState) => void;
    };
    const fullEventsFilter: FilterState = [
      { column: "latency", type: "number", operator: ">", value: 2 },
    ];
    act(() => searchArgs.setFilterState(fullEventsFilter));
    expect(useEventsSearchBarSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ filterState: fullEventsFilter }),
    );
  });

  it("loads the next page when the observations table reaches the bottom", () => {
    render(
      <TooltipProvider>
        <SampleObservationSelector
          projectId="project-1"
          timeRange={null}
          selectedObservationId={observation.id}
          onSelect={vi.fn()}
          onOpenTrace={vi.fn()}
        />
      </TooltipProvider>,
    );

    const scrollContainer = screen.getByTestId("sample-table-scroll");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 256 },
      scrollHeight: { configurable: true, value: 512 },
      scrollTop: { configurable: true, value: 256 },
    });
    fireEvent.scroll(scrollContainer);

    expect(eventsAllInputsSpy.mock.calls.map(([input]) => input.page)).toEqual([
      1, 1, 2,
    ]);
  });
});
