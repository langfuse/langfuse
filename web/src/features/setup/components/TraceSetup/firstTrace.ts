import {
  formatDurationMs,
  prepareTimeline,
  spanOffsetsOf,
} from "@/src/features/traces/fns/timeline/layout";
import { integrationOf } from "../../integrations/catalog";
import type { FirstTrace, FirstTraceNode } from "./types";

/** How many rows of a trace the receipt shows before "+N more". */
const VISIBLE_ROWS = 3;

/** The prefix Claude Code and Pi put before a tool's name. */
const TOOL_PREFIX = /^Tool: /;

/** Every step under these, breadth first. */
function allStepsOf(roots: FirstTraceNode[]) {
  const nodes = [...roots];
  // The loop reaches the children it appends
  for (const node of nodes) nodes.push(...node.children);
  return nodes;
}

/**
 * The steps inside the trace's wrapper: the trace view's TRACE node, then a single span or agent around everything
 * (Claude Code's `Conversational Turn`, an app's root span). A trace with several roots has no wrapper.
 */
function insideWrapper(roots: FirstTraceNode[]): FirstTraceNode[] {
  const [only] = roots;
  if (roots.length !== 1 || !only || only.children.length === 0) return roots;
  return only.type === "TRACE" ? insideWrapper(only.children) : only.children;
}

/**
 * A trace's first rows in tree order, each placed on the trace's own timeline from 0 to 1 the way the trace view's
 * timeline places it, and how many rows didn't fit. The last row goes to the first failed step, or else the first LLM
 * call, when it isn't already in view. The wrapper around the whole trace isn't a row: the receipt's title names it.
 */
export function waterfallOf(roots: FirstTraceNode[]) {
  const { rows, originMs, durationMs } = prepareTimeline(insideWrapper(roots));
  const scaleMs = Math.max(durationMs, 1);
  const visible = rows.slice(0, VISIBLE_ROWS);
  const mustShow =
    rows.find(({ node }) => node.level === "ERROR") ??
    rows.find(({ node }) => node.type === "GENERATION");
  const shown =
    mustShow && !visible.includes(mustShow)
      ? [...visible.slice(0, VISIBLE_ROWS - 1), mustShow]
      : visible;
  return {
    hiddenCount: rows.length - shown.length,
    rows: shown.map(({ node, depth }) => {
      const { startMs, endMs } = spanOffsetsOf(node, originMs);
      return {
        node,
        depth,
        start: startMs / scaleMs,
        share: (endMs - startMs) / scaleMs,
        startMs,
        durationMs: endMs - startMs,
      };
    }),
  };
}

/** Step types by how much they tell a newcomer, after the docs' observation types: the guide names the first three. */
const TYPE_IMPORTANCE: FirstTraceNode["type"][] = [
  "GENERATION",
  "TOOL",
  "AGENT",
  "RETRIEVER",
  "SPAN",
  "EMBEDDING",
  "CHAIN",
  "EVALUATOR",
  "GUARDRAIL",
  "EVENT",
  "TRACE",
];

const BEST_PRACTICES = "https://langfuse.com/docs/observability/best-practices";

/** The two most telling kinds of step among these, most telling first. */
export function typesOf(nodes: FirstTraceNode[]) {
  const present = new Set(nodes.map(({ type }) => type));
  return TYPE_IMPORTANCE.filter((type) => present.has(type)).slice(0, 2);
}

/** Every step inside the trace's wrapper, breadth first. */
function stepsOf(roots: FirstTraceNode[]) {
  return allStepsOf(insideWrapper(roots));
}

/**
 * A coding agent's turn as its receipt reads it: how many steps and tool calls, the three tools it called most (ties:
 * first called), and how many steps warned or failed. Timing is left out: some plugins record most steps as instants.
 */
export function turnSummaryOf(roots: FirstTraceNode[]) {
  const nodes = stepsOf(roots);
  const counts = new Map<string, number>();
  for (const { type, name } of nodes) {
    if (type !== "TOOL") continue;
    const tool = name.replace(TOOL_PREFIX, "");
    counts.set(tool, (counts.get(tool) ?? 0) + 1);
  }
  return {
    steps: nodes.length,
    toolCalls: [...counts.values()].reduce((sum, count) => sum + count, 0),
    topTools: [...counts]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name, count]) => ({ name, count })),
    warnings: nodes.filter(
      ({ level }) => level === "WARNING" || level === "ERROR",
    ).length,
  };
}

/** The first step that failed, anywhere in the trace, its wrapper too. */
function firstFailedStep(trace: FirstTrace) {
  return allStepsOf(trace.roots).find(({ level }) => level === "ERROR") ?? null;
}

/** The one thing worth fixing in a first trace: what it says, the link's text and where it goes. */
export type Tip = { text: string; action: string; href: string };

/**
 * The one thing worth fixing in a first trace, if anything: LLM calls that aren't generations (no cost or tokens), a
 * model Langfuse has no price for, or no input and output to read the trace by. `null` for a healthy trace.
 */
export function tipFor(trace: FirstTrace): Tip | null {
  const generations = allStepsOf(trace.roots).filter(
    ({ type }) => type === "GENERATION",
  );
  if (generations.length === 0)
    return {
      text: "Your LLM calls aren't marked as generations, so cost and tokens won't show.",
      action: "How to mark them",
      href: `${BEST_PRACTICES}#track-model-tokens-and-cost-on-generations`,
    };
  if (trace.costUsd === null && generations.some(({ model }) => model))
    return {
      text: "Langfuse doesn't know this model's price yet, so the trace has no cost.",
      action: "Add its price",
      href: "https://langfuse.com/docs/model-usage-and-cost",
    };
  if (trace.io === null)
    return {
      text: "Give the trace an input and output, so you can read it at a glance.",
      action: "What to send",
      href: `${BEST_PRACTICES}#choose-meaningful-input-and-output`,
    };
  return null;
}

/**
 * Three things to ask Halo about this trace, concrete enough to act on: score more like it, explain its slowest step
 * (or, for an agent's turn, the turn's length), and turn it into something reusable.
 */
export function haloAsksOf(trace: FirstTrace) {
  const steps = stepsOf(trace.roots);
  const lengthOf = (node: FirstTraceNode) => {
    const { startMs, endMs } = spanOffsetsOf(node, node.startTime.getTime());
    return endMs - startMs;
  };
  if (trace.source.kind === "agent") {
    const start = Math.min(...steps.map((node) => node.startTime.getTime()));
    const end = Math.max(
      ...steps.map((node) => node.startTime.getTime() + lengthOf(node)),
    );
    return [
      "Score each turn for doing what I asked",
      `What made this turn take ${formatDurationMs(end - start)}?`,
      "Which tool calls cost the most?",
    ];
  }
  const slowest = steps.reduce<FirstTraceNode | null>(
    (best, node) => (!best || lengthOf(node) > lengthOf(best) ? node : best),
    null,
  );
  return [
    "Score every answer like this one",
    slowest
      ? `Why did ${slowest.name} take ${formatDurationMs(lengthOf(slowest))}?`
      : "Why was this trace slow?",
    "Save this trace as a test case",
  ];
}

/** One row of an app trace's receipt, placed on the trace's timeline from 0 to 1. */
export type WaterfallRow = ReturnType<typeof waterfallOf>["rows"][number];

/**
 * What the receipt shows: an app trace's first steps as a waterfall, or a coding agent's turn as what was asked and
 * what it did; either way its two most telling kinds of step.
 */
export type Receipt =
  | {
      kind: "waterfall";
      rows: WaterfallRow[];
      hiddenCount: number;
      types: FirstTraceNode["type"][];
    }
  | {
      kind: "turn";
      input: string | null;
      summary: ReturnType<typeof turnSummaryOf>;
      types: FirstTraceNode["type"][];
    };

/** The receipt alone, for a trace that needs no next step, like a demo trace. */
export function receiptOf(trace: FirstTrace): Receipt {
  if (trace.source.kind === "agent")
    return {
      kind: "turn",
      input: trace.io?.input ?? null,
      summary: turnSummaryOf(trace.roots),
      types: typesOf(stepsOf(trace.roots)),
    };
  const { rows, hiddenCount } = waterfallOf(trace.roots);
  return {
    kind: "waterfall",
    rows,
    hiddenCount,
    types: typesOf(rows.map(({ node }) => node)),
  };
}

/** Everything the receipt and the next step read from a trace, walked once per trace instead of on every render. */
export function readingOf(trace: FirstTrace) {
  return {
    receipt: receiptOf(trace),
    failed: firstFailedStep(trace),
    tip: tipFor(trace),
    haloAsks: haloAsksOf(trace),
  };
}

export type TraceReading = ReturnType<typeof readingOf>;

/** The coding agent a turn came from, named as the integrations catalog names it; `null` for an app's trace. */
export function agentOf(trace: FirstTrace) {
  if (trace.source.kind !== "agent") return null;
  const { slug, sessionHref } = trace.source;
  const name = integrationOf(slug)?.name ?? "coding agent";
  return { slug, name, sessionHref };
}

/** The first trace's title: a coding agent's turn names its agent. */
export function firstTraceTitle(trace: FirstTrace) {
  const agent = agentOf(trace);
  return agent
    ? `Your first ${agent.name} turn is in`
    : "Your first trace is in";
}
