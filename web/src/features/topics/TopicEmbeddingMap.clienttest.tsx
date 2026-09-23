import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TopicEmbeddingMap } from "./TopicEmbeddingMap";

const query = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("@/src/components/table/peek/hooks/usePeekNavigation", () => ({
  usePeekNavigation: () => ({}),
}));
vi.mock("@/src/utils/api", () => ({
  api: { topics: { map: { useQuery: () => query } } },
}));

it("fits a tall cohort across the landscape plot while preserving pairwise distances", () => {
  const points = [
    [0, 0],
    [0, 10],
    [2, 20],
    [1, 30],
  ].map(([x, y], index) => ({
    traceId: `trace-${index}`,
    summary: `Summary ${index}`,
    topicId: null,
    outcome: "outlier",
    x,
    y,
  }));
  query.data = {
    status: "ready",
    runId: "run",
    missingSummaryCount: 0,
    unpositionedCount: 0,
    points,
  };
  const view = render(
    <TopicEmbeddingMap
      projectId="project"
      runId="run"
      topics={[]}
      selectedTopic={null}
      selectedTraceId={null}
      onSelectTopic={vi.fn()}
    />,
  );
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
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
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
