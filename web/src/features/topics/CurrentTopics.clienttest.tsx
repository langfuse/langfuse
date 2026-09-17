import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CurrentTopics } from "./CurrentTopics";

const state = vi.hoisted(() => ({ data: [] as unknown[], push: vi.fn() }));
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    pathname: "/project/[projectId]/topics",
    push: state.push,
  }),
}));
vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));
vi.mock("@/src/components/table/peek/peek-trace-detail", () => ({
  TablePeekViewTraceDetail: () => <div data-testid="trace-peek" />,
}));
vi.mock("@/src/utils/api", () => ({
  getPathnameWithoutBasePath: () => "/project/project/topics",
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
  it("switches facets, pages current traces, and separates cleared topic results from assigned membership", () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      traceId: `trace-${i}`,
      summary: `Summary ${i}`,
      outcome: i === 20 ? "not_applicable" : "assigned",
      topicId: i === 20 ? null : "billing",
      topicName: i === 20 ? null : "Billing",
      awaitingUpdate: i === 0,
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
    const view = render(<CurrentTopics projectId="project" running={false} />);
    expect(screen.getByRole("tab", { name: "Intent" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Issues" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      21,
    );
    expect(
      screen.getByText("Previous result · update pending"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "trace-0" }));
    expect(state.push).toHaveBeenLastCalledWith(
      { pathname: "/project/project/topics", query: { peek: "trace-0" } },
      undefined,
      { shallow: true },
    );
    fireEvent.click(
      screen.getByRole("row", { name: /trace-1 Billing Summary 1$/ }),
    );
    expect(state.push).toHaveBeenLastCalledWith(
      { pathname: "/project/project/topics", query: { peek: "trace-1" } },
      undefined,
      { shallow: true },
    );
    expect(screen.queryByRole("button", { name: "trace-20" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(
      screen.getByRole("button", { name: "trace-20" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Billing tasks/ }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      21,
    );
    expect(screen.queryByRole("button", { name: "trace-20" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "No topic (1)" }));
    const cleared = screen.getByRole("row", { name: /trace-20/ });
    expect(
      within(cleared).getByRole("button", { name: "trace-20" }),
    ).toBeInTheDocument();
    expect(within(cleared).getByText("Summary 20")).toBeInTheDocument();
    expect(within(cleared).getByText("not applicable")).toBeInTheDocument();
    expect(within(cleared).queryByText("Billing")).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Issues" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.getByRole("tabpanel", { name: "Issues" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No traces in this selection."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).queryByRole("button", {
        name: /^trace-/,
      }),
    ).toBeNull();

    state.data = [...state.data].reverse();
    view.rerender(<CurrentTopics projectId="project" running={false} />);
    expect(screen.getByRole("tab", { name: "Issues" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    state.data = state.data.slice(1);
    view.rerender(<CurrentTopics projectId="project" running={false} />);
    expect(
      screen.getByRole("tabpanel", { name: "Intent" }),
    ).toBeInTheDocument();
  });
});
