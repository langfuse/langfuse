import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopicEmbeddingMap } from "./TopicEmbeddingMap";

const query = vi.hoisted(() => ({ data: undefined as unknown }));
const peek = vi.hoisted(() => ({ openPeek: vi.fn() }));
vi.mock("@/src/components/table/peek/hooks/usePeekNavigation", () => ({
  usePeekNavigation: () => peek,
}));
vi.mock("@/src/utils/api", () => ({
  api: { topics: { map: { useQuery: () => query } } },
}));

const props = {
  projectId: "project",
  executionId: "execution",
  facetVersionId: "facet",
  topics: [
    {
      id: "billing",
      name: "Billing",
    },
  ],
  selectedTopic: null,
  onSelectTopic: vi.fn(),
};
const ready = {
  status: "ready",
  runId: "run",
  reason: null,
  missingSummaryCount: 0,
  unpositionedCount: 0,
  points: [
    {
      summaryId: "a",
      traceId: "trace-a",
      summary: "An invoice question",
      x: 5,
      y: 8,
      topicId: "billing",
      outcome: "assigned",
    },
    {
      summaryId: "b",
      traceId: "trace-b",
      summary: "A baking question",
      x: 9,
      y: 8,
      topicId: null,
      outcome: "outlier",
    },
  ],
};

describe("embedding map", () => {
  it("reports point selection without treating hover as selection", () => {
    query.data = ready;
    const onSelectTrace = vi.fn();
    render(
      <TopicEmbeddingMap
        {...props}
        onSelectTrace={onSelectTrace}
        headerActions={<button>Split</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Split" })).toBeInTheDocument();
    const invoice = screen.getByRole("button", {
      name: "trace-a: An invoice question",
    });
    const baking = screen.getByRole("button", {
      name: "trace-b: A baking question",
    });
    fireEvent.mouseEnter(invoice);
    expect(onSelectTrace).not.toHaveBeenCalled();
    fireEvent.click(invoice);
    expect(onSelectTrace).toHaveBeenLastCalledWith("trace-a");
    fireEvent.mouseLeave(invoice);
    fireEvent.mouseEnter(baking);
    expect(onSelectTrace).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(baking, { key: "Enter" });
    expect(onSelectTrace).toHaveBeenLastCalledWith("trace-b");
    fireEvent.keyDown(baking, { key: " " });
    expect(onSelectTrace).toHaveBeenLastCalledWith(null);
    expect(onSelectTrace).toHaveBeenCalledTimes(3);
  });

  it("uses the parent trace selection when filters clear the selected row", () => {
    query.data = ready;
    const onSelectTrace = vi.fn();
    const view = render(
      <TopicEmbeddingMap
        {...props}
        selectedTraceId="trace-a"
        onSelectTrace={onSelectTrace}
      />,
    );
    const invoice = screen.getByRole("button", {
      name: "trace-a: An invoice question",
    });
    expect(invoice).toHaveAttribute("aria-pressed", "true");
    view.rerender(
      <TopicEmbeddingMap
        {...props}
        selectedTraceId={null}
        onSelectTrace={onSelectTrace}
      />,
    );
    expect(invoice).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(invoice);
    expect(onSelectTrace).toHaveBeenLastCalledWith("trace-a");
  });

  it("pins a selected summary through hover and opens its trace in peek", () => {
    peek.openPeek.mockClear();
    query.data = ready;
    const view = render(<TopicEmbeddingMap {...props} />);
    const invoice = screen.getByRole("button", {
      name: "trace-a: An invoice question",
    });
    fireEvent.keyDown(invoice, { key: "Enter" });
    const baking = screen.getByRole("button", {
      name: "trace-b: A baking question",
    });
    fireEvent.mouseEnter(baking);
    expect(screen.getByText("An invoice question")).toBeInTheDocument();
    expect(screen.queryByText("A baking question")).toBeNull();
    expect(invoice).toHaveAttribute("aria-pressed", "true");
    const trace = screen.getByRole("button", { name: /^trace-a(?: ↗)?$/ });
    fireEvent.click(trace);
    expect(peek.openPeek).toHaveBeenCalledWith("trace-a");
    expect(screen.queryByRole("link", { name: /trace-a/ })).toBeNull();
    fireEvent.mouseLeave(baking);
    expect(screen.getByText("An invoice question")).toBeInTheDocument();
    fireEvent.keyDown(invoice, { key: "ArrowRight" });
    expect(document.activeElement).toBe(baking);
    expect(
      view.container.querySelectorAll('circle[tabindex="0"]'),
    ).toHaveLength(1);
    expect(baking.getAttribute("tabindex")).toBe("0");
    view.rerender(<TopicEmbeddingMap {...props} selectedTopic="billing" />);
    expect(view.container.querySelectorAll("circle")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "trace-b: A baking question" }),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "trace-a: An invoice question" })
        .getAttribute("tabindex"),
    ).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "All topics" }));
    expect(props.onSelectTopic).toHaveBeenLastCalledWith(null);
  });

  it("fits a tall cohort across the landscape plot while preserving pairwise distances", () => {
    const points = [
      [0, 0],
      [0, 10],
      [2, 20],
      [1, 30],
    ].map(([x, y], index) => ({
      ...ready.points[0],
      summaryId: `summary-${index}`,
      traceId: `trace-${index}`,
      x,
      y,
    }));
    query.data = { ...ready, points };
    const view = render(<TopicEmbeddingMap {...props} />);
    const positions = [...view.container.querySelectorAll("circle")].map(
      (circle) => ({
        x: Number(circle.getAttribute("cx")),
        y: Number(circle.getAttribute("cy")),
      }),
    );
    const spanX =
      Math.max(...positions.map((point) => point.x)) -
      Math.min(...positions.map((point) => point.x));
    const spanY =
      Math.max(...positions.map((point) => point.y)) -
      Math.min(...positions.map((point) => point.y));
    expect(spanX).toBeGreaterThan(spanY);
    const distance = (
      a: { x: number; y: number },
      b: { x: number; y: number },
    ) => Math.hypot(a.x - b.x, a.y - b.y);
    const scale =
      distance(positions[0], positions[1]) / distance(points[0], points[1]);
    for (let a = 0; a < points.length; a++) {
      for (let b = a + 1; b < points.length; b++) {
        expect(
          distance(positions[a], positions[b]) / distance(points[a], points[b]),
        ).toBeCloseTo(scale, 8);
      }
    }
  });

  it("explains unpositioned later-batch summaries and never invents dots", () => {
    query.data = { ...ready, unpositionedCount: 1 };
    const view = render(<TopicEmbeddingMap {...props} />);
    expect(view.container.querySelectorAll("circle")).toHaveLength(2);
    expect(
      screen.getByText(/1 summaries in this execution have no coordinates/),
    ).toBeTruthy();
    query.data = {
      ...ready,
      status: "unavailable",
      reason: "Saved coordinates are unavailable.",
    };
    view.rerender(<TopicEmbeddingMap {...props} />);
    expect(view.container.querySelectorAll("circle")).toHaveLength(0);
    expect(screen.getByText("Saved coordinates are unavailable.")).toBeTruthy();
  });
});
