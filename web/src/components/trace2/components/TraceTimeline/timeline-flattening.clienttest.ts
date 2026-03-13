/**
 * @jest-environment jsdom
 */

import { flattenTreeWithTimelineMetrics } from "./timeline-flattening";
import { SCALE_WIDTH } from "./timeline-calculations";
import type { TreeNode } from "../../lib/types";

describe("flattenTreeWithTimelineMetrics", () => {
  it("preserves exact time-to-first-token metrics for streaming observations", () => {
    const traceStart = new Date("2024-01-01T00:00:00.000Z");
    const streamingNode: TreeNode = {
      id: "generation-1",
      type: "GENERATION",
      name: "streaming-generation",
      startTime: traceStart,
      endTime: new Date("2024-01-01T00:00:02.000Z"),
      completionStartTime: new Date("2024-01-01T00:00:00.750Z"),
      timeToFirstToken: 0.75,
      children: [],
      startTimeSinceTrace: 0,
      startTimeSinceParentStart: null,
      depth: 0,
      childrenDepth: 0,
    };

    const [item] = flattenTreeWithTimelineMetrics(
      [streamingNode],
      new Set(),
      traceStart,
      2,
    );

    expect(item.metrics.startOffset).toBe(0);
    expect(item.metrics.itemWidth).toBe(SCALE_WIDTH);
    expect(item.metrics.firstTokenTimeOffset).toBe(SCALE_WIDTH * 0.375);
    expect(item.metrics.timeToFirstToken).toBe(0.75);
  });
});
