/**
 * Mock trace data for the double-panel layout EXPLORATION stories.
 *
 * Phase-0 design prototypes only — not shipped UI. We build one realistic,
 * deep-nested agent trace and reuse the real flattening logic so the prototype
 * panes (tree + timeline) render exactly like the app, letting reviewers judge
 * the layout/switching ideas against true content density.
 */

import Decimal from "decimal.js";
import { type TreeNode } from "../../../lib/types";
import { makeTreeNode } from "../../TraceTimeline/timeline.fixtures";
import { flattenTreeWithTimelineMetrics } from "../../TraceTimeline/timeline-flattening";
import {
  calculateTraceDuration,
  findEarliestStartTime,
  SCALE_WIDTH,
} from "../../TraceTimeline/timeline-calculations";

const T0 = Date.parse("2024-01-01T00:00:00.000Z");
const t = (ms: number) => new Date(T0 + ms);

const node = (
  overrides: Partial<TreeNode> & { id: string; name: string },
): TreeNode =>
  makeTreeNode({
    type: "SPAN",
    ...overrides,
  });

/**
 * A deep, branchy agent trace (~24 nodes, depth 6): the kind of trace the
 * overhaul has to stay legible on. Costs sit on the generations so the trailing
 * metric labels appear; one generation streams (completionStartTime) to show
 * the split bar.
 */
export const MOCK_TRACE_ROOT: TreeNode = node({
  id: "trace",
  name: "agent-customer-support-session",
  type: "TRACE",
  startTime: t(0),
  endTime: t(9200),
  latency: 9.2,
  children: [
    node({
      id: "plan",
      name: "plan-response",
      type: "AGENT",
      startTime: t(120),
      endTime: t(2600),
      latency: 2.48,
      children: [
        node({
          id: "plan-llm",
          name: "draft-plan",
          type: "GENERATION",
          startTime: t(180),
          endTime: t(2400),
          latency: 2.22,
          totalCost: new Decimal(0.0042),
        }),
      ],
    }),
    node({
      id: "retrieve",
      name: "retrieve-context",
      type: "CHAIN",
      startTime: t(2650),
      endTime: t(6100),
      latency: 3.45,
      children: [
        node({
          id: "embed",
          name: "embed-query",
          type: "EMBEDDING",
          startTime: t(2700),
          endTime: t(3050),
          latency: 0.35,
          totalCost: new Decimal(0.00002),
        }),
        node({
          id: "search",
          name: "vector-search",
          type: "RETRIEVER",
          startTime: t(3060),
          endTime: t(5200),
          latency: 2.14,
          children: [
            node({
              id: "shard-0",
              name: "vector-search-shard-0",
              type: "SPAN",
              startTime: t(3080),
              endTime: t(4100),
              latency: 1.02,
            }),
            node({
              id: "shard-1",
              name: "vector-search-shard-1",
              type: "SPAN",
              startTime: t(3080),
              endTime: t(4350),
              latency: 1.27,
            }),
            node({
              id: "shard-2",
              name: "vector-search-shard-2",
              type: "SPAN",
              startTime: t(4100),
              endTime: t(5200),
              latency: 1.1,
              children: [
                node({
                  id: "rerank",
                  name: "rerank-candidate-passages",
                  type: "SPAN",
                  startTime: t(4200),
                  endTime: t(5180),
                  latency: 0.98,
                }),
              ],
            }),
          ],
        }),
        node({
          id: "guard",
          name: "pii-guardrail",
          type: "GUARDRAIL",
          startTime: t(5210),
          endTime: t(5400),
          latency: 0.19,
        }),
      ],
    }),
    node({
      id: "answer",
      name: "compose-answer",
      type: "AGENT",
      startTime: t(6150),
      endTime: t(9200),
      latency: 3.05,
      children: [
        node({
          id: "answer-llm",
          name: "call-large-language-model",
          type: "GENERATION",
          startTime: t(6200),
          endTime: t(9000),
          latency: 2.8,
          totalCost: new Decimal(0.0193),
          // Streaming: first token at +900ms → split (wait | completion) bar.
          completionStartTime: t(7100),
        } as Partial<TreeNode> & { id: string; name: string }),
        node({
          id: "tool-lookup",
          name: "lookup-order-status",
          type: "TOOL",
          startTime: t(6260),
          endTime: t(6900),
          latency: 0.64,
        }),
        node({
          id: "format",
          name: "format-final-response",
          type: "SPAN",
          startTime: t(9010),
          endTime: t(9190),
          latency: 0.18,
        }),
      ],
    }),
  ],
});

export const MOCK_ROOTS: TreeNode[] = [MOCK_TRACE_ROOT];

const traceStart = findEarliestStartTime(MOCK_ROOTS) ?? new Date(T0);
export const MOCK_TRACE_DURATION = calculateTraceDuration(
  MOCK_ROOTS,
  traceStart,
);

/** Flattened rows (expanded), pre-computed metrics — shared by every take. */
export const flattenMock = (collapsed: Set<string>) =>
  flattenTreeWithTimelineMetrics(
    MOCK_ROOTS,
    collapsed,
    traceStart,
    MOCK_TRACE_DURATION,
    SCALE_WIDTH,
  );

/** Aggregate cost across roots — heatmap basis for the timeline bars. */
export const MOCK_PARENT_TOTAL_COST = MOCK_ROOTS.reduce<Decimal | undefined>(
  (acc, r) => (r.totalCost ? (acc ? acc.plus(r.totalCost) : r.totalCost) : acc),
  new Decimal(0.0235),
);

export { SCALE_WIDTH, MOCK_TRACE_DURATION as MOCK_DURATION };
