import { describe, expect, it } from "vitest";
import {
  layoutTopicGrid,
  sampleGridPoints,
  type GridPoint,
} from "./topic-grid-layout";

function cluster(topicIndex: number, cx: number, cy: number, n: number) {
  return Array.from({ length: n }, (_, i): GridPoint => {
    const angle = (i * 2.399963) % (Math.PI * 2);
    const radius = Math.sqrt(i / n) * 0.8;
    return {
      id: `t${topicIndex}-${i}`,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      topicIndex,
    };
  });
}

const points = [
  ...cluster(0, -5, -5, 60),
  ...cluster(1, 5, 5, 60),
  ...cluster(-1, 0, 0, 10),
];

describe("layoutTopicGrid", () => {
  it("places every point in its own cell inside the grid", () => {
    const layout = layoutTopicGrid(points, 16 / 9);
    const keys = new Set(layout.cells.map((cell) => `${cell.col},${cell.row}`));
    expect(keys.size).toBe(points.length);
    expect(layout.cells.length).toBe(points.length);
    for (const cell of layout.cells) {
      expect(cell.col).toBeGreaterThanOrEqual(0);
      expect(cell.col).toBeLessThan(layout.cols);
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.row).toBeLessThan(layout.rows);
    }
  });

  it("is deterministic for the same input", () => {
    const shuffled = [...points].reverse();
    expect(layoutTopicGrid(points, 1.5)).toEqual(layoutTopicGrid(points, 1.5));
    expect(layoutTopicGrid(shuffled, 1.5)).toEqual(
      layoutTopicGrid(points, 1.5),
    );
  });

  it("keeps far-apart clusters apart", () => {
    const layout = layoutTopicGrid(points, 1);
    const colsOf = (topic: number) =>
      layout.cells
        .filter((cell) => cell.topicIndex === topic)
        .map((c) => c.col);
    expect(Math.max(...colsOf(0))).toBeLessThan(Math.min(...colsOf(1)));
  });

  it("samples large inputs per topic, keeping topic shares", () => {
    const points = Array.from({ length: 5000 }, (_, index) => ({
      id: `t-${String(index).padStart(4, "0")}`,
      x: index % 100,
      y: Math.floor(index / 100),
      topicIndex: index < 4000 ? 0 : 1,
    }));
    const { points: sampled, perDot } = sampleGridPoints(points, 1000);
    expect(perDot).toBe(5);
    expect(sampled.filter((point) => point.topicIndex === 0)).toHaveLength(800);
    expect(sampled.filter((point) => point.topicIndex === 1)).toHaveLength(200);
    expect(
      sampled.reduce((sum, point) => sum + (point.memberIds?.length ?? 0), 0),
    ).toBe(5000);
    expect(sampleGridPoints(points.slice(0, 900), 1000).perDot).toBe(1);
  });
});
