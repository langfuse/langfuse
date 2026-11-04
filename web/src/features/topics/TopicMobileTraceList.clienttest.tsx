import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopicMobileTraceList } from "./TopicMobileTraceList";
import { type FacetRow } from "./facet-topics";

function makeRow(traceId: string, index: number): FacetRow {
  return {
    traceId,
    unitStartTime: new Date(1700000000000 + index * 1000).toISOString(),
    outcome: "success",
    topicName: `Topic ${index}`,
    summary: `Summary for ${traceId}`,
  } as unknown as FacetRow;
}

const mockRows = Array.from({ length: 45 }, (_, i) => makeRow(`trace-${i}`, i));

describe("TopicMobileTraceList", () => {
  it("initializes to the page of the selected trace", () => {
    render(
      <TopicMobileTraceList
        filterKey="filter-initial"
        rows={mockRows}
        selectedTraceId="trace-25"
        onOpenTrace={vi.fn()}
      >
        <div>Filter toolbar</div>
      </TopicMobileTraceList>,
    );

    // Page size is 20, so trace-25 is on page index 1 (items 20-39)
    expect(screen.getByText("trace-25")).toBeInTheDocument();
    expect(screen.queryByText("trace-5")).toBeNull();
    const selectedButton = screen.getByRole("button", {
      name: "Open trace trace-25",
    });
    expect(selectedButton).toHaveAttribute("aria-current", "true");
  });

  it("updates pageIndex when selectedTraceId changes to a trace on another page", () => {
    const { rerender } = render(
      <TopicMobileTraceList
        filterKey="filter-1"
        rows={mockRows}
        selectedTraceId="trace-5"
        onOpenTrace={vi.fn()}
      >
        <div>Filter toolbar</div>
      </TopicMobileTraceList>,
    );

    // trace-5 is on page index 0
    expect(screen.getByText("trace-5")).toBeInTheDocument();
    expect(screen.queryByText("trace-35")).toBeNull();

    // Select trace-35, which is on page index 1
    rerender(
      <TopicMobileTraceList
        filterKey="filter-1"
        rows={mockRows}
        selectedTraceId="trace-35"
        onOpenTrace={vi.fn()}
      >
        <div>Filter toolbar</div>
      </TopicMobileTraceList>,
    );

    expect(screen.getByText("trace-35")).toBeInTheDocument();
    expect(screen.queryByText("trace-5")).toBeNull();
    const selectedButton = screen.getByRole("button", {
      name: "Open trace trace-35",
    });
    expect(selectedButton).toHaveAttribute("aria-current", "true");
  });

  it("maintains the selected trace page when filterKey changes and selectedTraceId is still present", () => {
    const { rerender } = render(
      <TopicMobileTraceList
        filterKey="filter-1"
        rows={mockRows}
        selectedTraceId="trace-25"
        onOpenTrace={vi.fn()}
      >
        <div>Filter toolbar</div>
      </TopicMobileTraceList>,
    );

    expect(screen.getByText("trace-25")).toBeInTheDocument();

    // Filter changes, but trace-25 remains in rows
    rerender(
      <TopicMobileTraceList
        filterKey="filter-2"
        rows={mockRows}
        selectedTraceId="trace-25"
        onOpenTrace={vi.fn()}
      >
        <div>Filter toolbar</div>
      </TopicMobileTraceList>,
    );

    expect(screen.getByText("trace-25")).toBeInTheDocument();
  });

  it("resets pageIndex to 0 when filterKey changes and selectedTraceId is null", () => {
    const { rerender } = render(
      <TopicMobileTraceList
        filterKey="filter-1"
        rows={mockRows}
        selectedTraceId="trace-25"
        onOpenTrace={vi.fn()}
      >
        <div>Filter toolbar</div>
      </TopicMobileTraceList>,
    );

    expect(screen.getByText("trace-25")).toBeInTheDocument();

    // Filter changes and selection is cleared
    rerender(
      <TopicMobileTraceList
        filterKey="filter-2"
        rows={mockRows}
        selectedTraceId={null}
        onOpenTrace={vi.fn()}
      >
        <div>Filter toolbar</div>
      </TopicMobileTraceList>,
    );

    // Resets to page 0 (shows trace-0, not trace-25)
    expect(screen.getByText("trace-0")).toBeInTheDocument();
    expect(screen.queryByText("trace-25")).toBeNull();
  });

  it("calls onOpenTrace when a trace button is clicked", () => {
    const onOpenTrace = vi.fn();
    render(
      <TopicMobileTraceList
        filterKey="filter-1"
        rows={mockRows}
        selectedTraceId={null}
        onOpenTrace={onOpenTrace}
      >
        <div>Filter toolbar</div>
      </TopicMobileTraceList>,
    );

    const firstTraceButton = screen.getByRole("button", {
      name: "Open trace trace-0",
    });
    fireEvent.click(firstTraceButton);
    expect(onOpenTrace).toHaveBeenCalledWith("trace-0");
  });
});
