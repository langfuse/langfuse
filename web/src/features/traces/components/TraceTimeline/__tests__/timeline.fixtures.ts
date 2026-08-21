/**
 * Small fixtures for TraceTimeline stories. Kept minimal — the smallest shape
 * that renders each state — and shared across the TimelineBar / TimelineGutterRow
 * stories so node construction lives in one place.
 */

import Decimal from "decimal.js";
import { type TreeNode } from "@/src/features/traces/types/treeNode";
import {
  type TimelineBarProps,
  type TimelineRowNode,
} from "@/src/features/traces/components/TraceTimeline/types";

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

/**
 * A row as `layout()` returns it. Geometry is passed in directly rather than
 * computed so a story can pin the exact placement it wants to show.
 */
export function makeRow(
  overrides: Partial<TimelineRowNode> = {},
): TimelineRowNode {
  const node = overrides.node ?? makeTreeNode();
  return {
    node,
    id: node.id,
    name: node.name,
    type: node.type,
    index: 0,
    depth: 0,
    treeLines: [],
    isLastSibling: true,
    hasChildren: node.children.length > 0,
    isCollapsed: false,
    y: 0,
    height: 26,
    x: 60,
    width: 220,
    clippedLeft: false,
    clippedRight: false,
    offscreen: false,
    durationMs: 2000,
    firstTokenX: null,
    label: "2.00s",
    labelWidth: 32,
    labelPlacement: "after",
    labelX: 286,
    startMs: 0,
    endMs: 2000,
    ...overrides,
  };
}

export const cost = (value: number) => new Decimal(value);

/**
 * A numeric score, as the timeline receives them: metadata already stringified.
 *
 * `level` and the annotation flags matter for WIDTH: a row that mixes levels
 * grows a spelled-out pill per chip, and a value carrying a comment and metadata
 * grows two icons — all three are things the cluster has to reserve room for.
 */
export function score(
  name: string,
  value: number,
  extras: {
    level?: "trace" | "observation";
    comment?: string;
    metadata?: string;
    /**
     * A categorical score's own label. Worth setting when a test needs its width
     * to be EXACT: the measurer prices every digit at the widest digit's width,
     * on purpose (a ticking duration must not jitter), so a numeric value is
     * reserved a couple of px over — enough slack to hide a small mispricing
     * elsewhere in the same sum.
     */
    stringValue?: string;
  } = {},
): NonNullable<TimelineBarProps["scores"]>[number] {
  return {
    id: `score-${name}`,
    projectId: "project",
    environment: "default",
    name,
    value,
    stringValue: extras.stringValue ?? null,
    dataType: extras.stringValue ? "CATEGORICAL" : "NUMERIC",
    source: "API",
    authorUserId: null,
    comment: extras.comment ?? null,
    metadata: extras.metadata ?? null,
    configId: null,
    queueId: null,
    executionTraceId: null,
    createdAt: BASE_START,
    updatedAt: BASE_START,
    timestamp: BASE_START,
    traceId: "trace",
    sessionId: null,
    datasetRunId: null,
    // A trace-level score has no observation; that is what makes a row "mixed".
    observationId: extras.level === "trace" ? null : "node",
    longStringValue: "",
  };
}
