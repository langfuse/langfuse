import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileTopicsView } from "./MobileTopicsView";
import type { Facet } from "./facet-topics";

vi.mock("@/src/features/topics/TopicMobileList", () => ({
  TopicMobileList: () => <div data-testid="topic-mobile-list" />,
}));

vi.mock("@/src/features/topics/TopicMobileTraceList", () => ({
  TopicMobileTraceList: ({
    selectedTraceId,
    rows,
  }: {
    selectedTraceId: string | null;
    rows: unknown[];
  }) => (
    <div
      data-testid="topic-mobile-trace-list"
      data-selected-trace={selectedTraceId ?? "none"}
      data-row-count={rows.length}
    />
  ),
}));

vi.mock("@/src/features/topics/MobileTopicVisualization", () => ({
  MobileTopicVisualization: ({
    selectedTraceId,
  }: {
    selectedTraceId: string | null;
  }) => (
    <div
      data-testid="mobile-topic-viz"
      data-selected-trace={selectedTraceId ?? "none"}
    />
  ),
}));

vi.mock("@/src/features/topics/TopicsTraceToolbar", () => ({
  TopicsTraceToolbar: () => <div data-testid="topics-trace-toolbar" />,
}));

describe("MobileTopicsView activeSelectedTraceId", () => {
  const facetA: Facet = {
    facetId: "facet-a",
    name: "Facet A",
    facetVersion: 1,
    rows: [
      {
        facetVersion: 1,
        traceId: "trace-a-1",
        unitStartTime: "2026-10-26T00:00:00Z",
        summary: "Trace A1 summary",
        outcome: "assigned",
        topicId: "topic-1",
        topicName: "Topic 1",
      },
    ],
    topics: [
      {
        id: "topic-1",
        name: "Topic 1",
        description: null,
        count: 1,
      },
    ],
    map: null,
    awaitingCount: 0,
    usableCount: 1,
  };

  const facetB: Facet = {
    facetId: "facet-b",
    name: "Facet B",
    facetVersion: 1,
    rows: [
      {
        facetVersion: 1,
        traceId: "trace-b-1",
        unitStartTime: "2026-10-26T00:00:00Z",
        summary: "Trace B1 summary",
        outcome: "assigned",
        topicId: "topic-2",
        topicName: "Topic 2",
      },
    ],
    topics: [
      {
        id: "topic-2",
        name: "Topic 2",
        description: null,
        count: 1,
      },
    ],
    map: null,
    awaitingCount: 0,
    usableCount: 1,
  };

  it("passes through selectedTraceId when the trace belongs to the active facet rows", () => {
    render(
      <MobileTopicsView
        projectId="test-project"
        facet={facetA}
        view="grid"
        mapResult={{} as never}
        filters={[{ column: "topicId", type: "stringOptions", operator: "any of", value: ["topic-1"] }]}
        searchQuery={null}
        onFiltersChange={vi.fn()}
        onSearchQueryChange={vi.fn()}
        selectedTraceId="trace-a-1"
        onSelectTrace={vi.fn()}
        onOpenTrace={vi.fn()}
        onGenerateTopics={vi.fn()}
        canGenerateTopics={false}
        isV4={false}
      />
    );

    const traceList = screen.getByTestId("topic-mobile-trace-list");
    expect(traceList.getAttribute("data-selected-trace")).toBe("trace-a-1");
  });

  it("nullifies selectedTraceId when the trace belongs to a different facet", () => {
    // When switching from facetA to facetB, selectedTraceId is still "trace-a-1" from session storage
    render(
      <MobileTopicsView
        projectId="test-project"
        facet={facetB}
        view="grid"
        mapResult={{} as never}
        filters={[{ column: "topicId", type: "stringOptions", operator: "any of", value: ["topic-2"] }]}
        searchQuery={null}
        onFiltersChange={vi.fn()}
        onSearchQueryChange={vi.fn()}
        selectedTraceId="trace-a-1"
        onSelectTrace={vi.fn()}
        onOpenTrace={vi.fn()}
        onGenerateTopics={vi.fn()}
        canGenerateTopics={false}
        isV4={false}
      />
    );

    const traceList = screen.getByTestId("topic-mobile-trace-list");
    expect(traceList.getAttribute("data-selected-trace")).toBe("none");
  });
});
