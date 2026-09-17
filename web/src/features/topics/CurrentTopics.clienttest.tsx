import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CurrentTopics } from "./CurrentTopics";

const state = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      currentResults: {
        useQuery: () => ({ data: state.data, refetch: vi.fn() }),
      },
    },
  },
}));
vi.mock("./TopicEmbeddingMap", () => ({
  topicColor: () => "#000",
  TopicEmbeddingMap: () => <div>Map</div>,
}));

describe("Current Topics", () => {
  it("keeps facets together, pages current traces, and separates cleared topic results from assigned membership", () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      traceId: `trace-${i}`,
      summary: `Summary ${i}`,
      outcome: i === 20 ? "not_applicable" : "assigned",
      topicId: i === 20 ? null : "billing",
      topicName: i === 20 ? null : "Billing",
      awaitingUpdate: false,
    }));
    state.data = [
      {
        facetId: "intent",
        name: "Intent",
        facetVersion: 2,
        rows,
        topics: [
          {
            id: "billing",
            name: "Billing",
            description: "Billing tasks",
            count: 20,
          },
        ],
        map: null,
        awaitingCount: 0,
        usableCount: 20,
      },
      {
        facetId: "issues",
        name: "Issues",
        facetVersion: 1,
        rows: [],
        topics: [],
        map: null,
        awaitingCount: 0,
        usableCount: 0,
      },
    ];
    render(<CurrentTopics projectId="project" running={false} />);
    expect(screen.getByRole("heading", { name: "Intent" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Issues" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(20);
    expect(screen.queryByRole("link", { name: "trace-20" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next traces" }));
    expect(screen.getByRole("link", { name: "trace-20" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Billing tasks/ }));
    expect(screen.getAllByRole("article")).toHaveLength(20);
    expect(screen.queryByRole("link", { name: "trace-20" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "No topic (1)" }));
    const cleared = screen.getByRole("article");
    expect(
      within(cleared).getByRole("link", { name: "trace-20" }),
    ).toBeInTheDocument();
    expect(within(cleared).queryByText("Billing")).toBeNull();
  });
});
