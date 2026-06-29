/**
 * Small fixtures for TraceTimeline stories. Kept minimal — the smallest shape
 * that renders each state — and shared across the TimelineBar / TimelineGutterRow
 * stories so node construction lives in one place.
 */

import Decimal from "decimal.js";
import { type TreeNode } from "../../lib/types";
import { type FlatTimelineItem, type TimelineMetrics } from "./types";

const BASE_START = new Date("2024-01-01T00:00:00.000Z");

export function makeTreeNode(overrides: Partial<TreeNode> = {}): TreeNode {
  const startTime = overrides.startTime ?? BASE_START;
  return {
    id: "node",
    type: "GENERATION",
    name: "llm-call",
    startTime,
    endTime: new Date(startTime.getTime() + 2000),
    latency: 2,
    children: [],
    startTimeSinceTrace: 0,
    startTimeSinceParentStart: 0,
    depth: 0,
    childrenDepth: 0,
    ...overrides,
  };
}

export function makeMetrics(
  overrides: Partial<TimelineMetrics> = {},
): TimelineMetrics {
  return { startOffset: 60, itemWidth: 220, latency: 2, ...overrides };
}

export function makeItem(
  overrides: Partial<FlatTimelineItem> = {},
): FlatTimelineItem {
  return {
    node: overrides.node ?? makeTreeNode(),
    depth: 0,
    treeLines: [],
    isLastSibling: true,
    metrics: overrides.metrics ?? makeMetrics(),
    ...overrides,
  };
}

export const cost = (value: number) => new Decimal(value);
