import { useState, type ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { FilterState } from "@langfuse/shared";
import { describe, expect, it, vi } from "vitest";
import { CurrentTopics } from "./CurrentTopics";
import type { TopicsTraceToolbar } from "./TopicsTraceToolbar";

vi.mock("react-responsive", () => ({ useMediaQuery: () => false }));
vi.mock("@/src/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/src/components/table/peek/hooks/usePeekNavigation", () => ({
  usePeekNavigation: () => ({ openPeek: vi.fn() }),
}));
vi.mock("./TopicEmbeddingMap", () => ({
  TopicEmbeddingMap: ({
    matchingTraceIds,
  }: {
    matchingTraceIds?: ReadonlySet<string>;
  }) => (
    <output data-testid="map-matches">
      {matchingTraceIds ? JSON.stringify([...matchingTraceIds]) : "all"}
    </output>
  ),
}));
vi.mock("./TopicsTraceToolbar", () => ({
  TopicsTraceToolbar: ({
    searchQuery,
    onSearchQueryChange,
    filters,
  }: ComponentProps<typeof TopicsTraceToolbar>) => (
    <>
      <input
        aria-label="Search summaries"
        value={searchQuery ?? ""}
        onChange={(event) => onSearchQueryChange(event.target.value || null)}
      />
      <output data-testid="filters">{JSON.stringify(filters)}</output>
    </>
  ),
}));
vi.mock("@/src/components/table/data-table", () => ({
  DataTable: ({
    data,
    pagination,
  }: {
    data: { data: { traceId: string }[] };
    pagination: {
      totalCount: number;
      state: { pageIndex: number; pageSize: number };
      onChange: (state: { pageIndex: number; pageSize: number }) => void;
    };
  }) => (
    <>
      <output data-testid="table-rows">
        {JSON.stringify(data.data.map((row) => row.traceId))}
      </output>
      <output data-testid="pagination">
        {JSON.stringify({
          ...pagination.state,
          totalCount: pagination.totalCount,
        })}
      </output>
      <button
        onClick={() => pagination.onChange({ pageIndex: 0, pageSize: 50 })}
      >
        Show 50
      </button>
      <button
        onClick={() =>
          pagination.onChange({
            ...pagination.state,
            pageIndex: pagination.state.pageIndex + 1,
          })
        }
      >
        Next page
      </button>
    </>
  ),
}));

const timeRange = { from: new Date("2026-10-01"), to: new Date("2026-10-02") };
const topic = {
  id: "billing",
  name: "Billing questions",
  description: "Invoice support",
  count: 60,
};
const rows = Array.from({ length: 120 }, (_, index) => ({
  traceId: `trace-${index}`,
  summary: index >= 60 ? "Invoice refund" : "Account setup",
  topicId: index % 2 === 0 ? "billing" : null,
  topicName: index % 2 === 0 ? "Billing questions" : null,
  outcome: index % 2 === 0 ? "assigned" : "outlier",
  facetVersion: 1,
  unitStartTime: timeRange.from.toISOString(),
}));

function CurrentTopicsExample() {
  const [filters, setFilters] = useState<FilterState>([]);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  return (
    <CurrentTopics
      projectId="project"
      timeRange={timeRange}
      selectedFacetId="intent"
      result={{
        data: [
          {
            facetId: "intent",
            name: "Intent",
            facetVersion: 1,
            rows,
            topics: [topic],
            map: { runId: "run", topics: [topic] },
            awaitingCount: 0,
            usableCount: rows.length,
          },
        ],
        isLoading: false,
        error: null,
      }}
      traceFilters={{
        filters,
        setFilters,
        searchQuery,
        setSearchQuery,
        selectedFacetId: "intent",
        selectFacet: vi.fn(),
      }}
    />
  );
}

const readOutput = (id: string) =>
  JSON.parse(screen.getByTestId(id).textContent!);

describe("current Topics filter integration", () => {
  it("filters the whole result set, shares matches with the map and resets pagination without losing page size", () => {
    render(<CurrentTopicsExample />);
    fireEvent.click(screen.getByRole("button", { name: "Show 50" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(readOutput("pagination")).toEqual({
      pageIndex: 1,
      pageSize: 50,
      totalCount: 120,
    });

    fireEvent.change(screen.getByLabelText("Search summaries"), {
      target: { value: "invoice" },
    });
    const matches = rows.slice(60).map((row) => row.traceId);
    expect(readOutput("pagination")).toEqual({
      pageIndex: 0,
      pageSize: 50,
      totalCount: 60,
    });
    expect(readOutput("table-rows")).toEqual(matches.slice(0, 50));
    expect(readOutput("map-matches")).toEqual(matches);

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(readOutput("table-rows")).toEqual(matches.slice(50));
    fireEvent.change(screen.getByLabelText("Search summaries"), {
      target: { value: "" },
    });
    expect(readOutput("pagination")).toEqual({
      pageIndex: 0,
      pageSize: 50,
      totalCount: 120,
    });
    expect(readOutput("table-rows")).toEqual(
      rows.slice(0, 50).map((row) => row.traceId),
    );
    expect(screen.getByTestId("map-matches").textContent).toBe("all");

    fireEvent.click(screen.getByRole("button", { name: /Billing questions/ }));
    expect(readOutput("filters")).toEqual([
      {
        column: "topicId",
        type: "stringOptions",
        operator: "any of",
        value: ["billing"],
      },
    ]);
    const billing = rows
      .filter((row) => row.topicId === "billing")
      .map((row) => row.traceId);
    expect(readOutput("pagination")).toEqual({
      pageIndex: 0,
      pageSize: 50,
      totalCount: 60,
    });
    expect(readOutput("table-rows")).toEqual(billing.slice(0, 50));
    expect(readOutput("map-matches")).toEqual(billing);
  });
});
