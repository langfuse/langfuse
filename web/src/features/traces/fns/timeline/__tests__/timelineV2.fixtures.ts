/**
 * The shape matrix for the timeline-renderer spike: one generator per trace
 * shape the renderer has to survive, deterministic so the Storybook cells and
 * the tests look at the same pixels.
 */

import type { LayoutNode } from "@/src/features/traces/fns/timeline/layout";

const BASE_START = new Date("2024-01-01T00:00:00.000Z").getTime();

type SpanSpec = {
  name: string;
  type?: string;
  /** ms after the trace origin */
  startMs: number;
  /** ms; null → no endTime at all */
  durationMs: number | null;
  children?: SpanSpec[];
  latency?: number;
  /** ms after the trace origin; the moment a streaming model produced its first token */
  firstTokenMs?: number;
};

function toNode(spec: SpanSpec, path: string): LayoutNode {
  const startTime = new Date(BASE_START + spec.startMs);
  return {
    id: path,
    name: spec.name,
    type: spec.type ?? "SPAN",
    startTime,
    endTime:
      spec.durationMs == null
        ? null
        : new Date(BASE_START + spec.startMs + spec.durationMs),
    latency: spec.latency,
    completionStartTime:
      spec.firstTokenMs == null
        ? null
        : new Date(BASE_START + spec.firstTokenMs),
    children: (spec.children ?? []).map((child, index) =>
      toNode(child, `${path}.${index}`),
    ),
  };
}

const build = (specs: SpanSpec[]): LayoutNode[] =>
  specs.map((spec, index) => toNode(spec, `n${index}`));

/** Deterministic pseudo-random so 500- and 10k-span cells never flicker. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

export const singleSpan = (): LayoutNode[] =>
  build([
    { name: "openai.chat", type: "GENERATION", startMs: 0, durationMs: 1_240 },
  ]);

export const threeSpans = (): LayoutNode[] =>
  build([
    {
      name: "handle-request",
      startMs: 0,
      durationMs: 1_800,
      children: [
        { name: "retrieve-docs", startMs: 40, durationMs: 320 },
        {
          name: "openai.chat",
          type: "GENERATION",
          startMs: 380,
          durationMs: 1_350,
        },
      ],
    },
  ]);

export const deepNesting = (levels = 12): LayoutNode[] => {
  let child: SpanSpec | undefined;
  for (let level = levels - 1; level >= 0; level--) {
    child = {
      name: `level-${level}`,
      startMs: level * 12,
      durationMs: 900 - level * 60,
      children: child ? [child] : [],
    };
  }
  return build([child!]);
};

/**
 * The observation types a real agent trace actually contains, in roughly the
 * proportions you see one: mostly spans and model calls, with tools, retrievers
 * and the occasional guardrail. Generated traces used to be all SPAN and
 * GENERATION, which made anything colour-coded by type look like it was not
 * colour-coded at all.
 */
const REALISTIC_TYPES = [
  "SPAN",
  "GENERATION",
  "SPAN",
  "TOOL",
  "GENERATION",
  "CHAIN",
  "SPAN",
  "RETRIEVER",
  "GENERATION",
  "EMBEDDING",
  "SPAN",
  "AGENT",
  "GENERATION",
  "EVENT",
  "SPAN",
  "GUARDRAIL",
] as const;

const NAME_BY_TYPE: Record<string, string> = {
  SPAN: "step",
  GENERATION: "openai.chat",
  TOOL: "stripe.refund",
  CHAIN: "sequence",
  RETRIEVER: "vector-search",
  EMBEDDING: "embed-query",
  AGENT: "planner",
  EVENT: "checkpoint",
  GUARDRAIL: "output-guard",
};

/** A root plus `count - 1` descendants in a balanced arity-6 tree. */
export const manySpans = (count: number): LayoutNode[] => {
  const random = seededRandom(count);
  const totalMs = 24_000;
  const root: SpanSpec = {
    name: "agent-run",
    type: "AGENT",
    startMs: 0,
    durationMs: totalMs,
    children: [],
  };

  const open: SpanSpec[] = [root];
  for (let i = 1; i < count; i++) {
    const parent = open[Math.floor(random() * Math.min(open.length, 32))]!;
    const parentDuration = parent.durationMs ?? totalMs;
    const startMs =
      parent.startMs + Math.floor(random() * Math.max(parentDuration - 20, 1));
    const durationMs = Math.max(
      2,
      Math.floor(
        random() * Math.max(parent.startMs + parentDuration - startMs, 2),
      ),
    );
    const type = REALISTIC_TYPES[i % REALISTIC_TYPES.length]!;
    const spec: SpanSpec = {
      name: `${NAME_BY_TYPE[type] ?? "step"}-${i}`,
      type,
      startMs,
      durationMs,
      children: [],
    };
    parent.children!.push(spec);
    if (
      (parent.children!.length >= 6 || parentDuration < 40) &&
      open.length > 1
    ) {
      open.splice(open.indexOf(parent), 1);
    }
    open.push(spec);
  }

  return build([root]);
};

/** Nimar's complaint, generalised: real work is 0.3% of the wall clock. */
export const longTailTrace = (): LayoutNode[] =>
  build([
    {
      name: "nightly-batch",
      startMs: 0,
      durationMs: 36_020,
      children: [
        { name: "load-config", startMs: 10, durationMs: 40 },
        {
          name: "openai.chat",
          type: "GENERATION",
          startMs: 18_000,
          durationMs: 40,
        },
        { name: "write-results", startMs: 35_960, durationMs: 40 },
      ],
    },
  ]);

const allInstantaneous = (): LayoutNode[] =>
  build([
    {
      name: "fanout",
      startMs: 0,
      durationMs: 0,
      children: [
        { name: "event-a", startMs: 0, durationMs: 0 },
        { name: "event-b", startMs: 0, durationMs: 0 },
        { name: "event-c", startMs: 0, durationMs: 0 },
      ],
    },
  ]);

const missingEndTimes = (): LayoutNode[] =>
  build([
    {
      name: "in-flight-run",
      startMs: 0,
      durationMs: null,
      children: [
        { name: "retrieve-docs", startMs: 120, durationMs: null },
        {
          name: "openai.chat",
          type: "GENERATION",
          startMs: 260,
          durationMs: null,
        },
      ],
    },
  ]);

/** Single instantaneous span: the fully collapsed trace. */
const zeroDurationTrace = (): LayoutNode[] =>
  build([{ name: "ping", startMs: 0, durationMs: 0 }]);

/**
 * The shape from the community report: a sub-second LangGraph tree, nine nested
 * observations, rendered in a peek-width lane. This is the acceptance cell.
 */
export const reporterTrace = (): LayoutNode[] =>
  build([
    {
      name: "LangGraph",
      type: "CHAIN",
      startMs: 0,
      durationMs: 486,
      children: [
        {
          name: "ideator",
          type: "CHAIN",
          startMs: 4,
          durationMs: 232,
          children: [
            {
              name: "RunnableSequence",
              type: "CHAIN",
              startMs: 6,
              durationMs: 228,
              children: [
                {
                  name: "ChatPromptTemplate",
                  type: "SPAN",
                  startMs: 7,
                  durationMs: 2,
                },
                {
                  name: "ChatGroq",
                  type: "GENERATION",
                  startMs: 10,
                  durationMs: 222,
                },
              ],
            },
          ],
        },
        {
          name: "writer",
          type: "CHAIN",
          startMs: 240,
          durationMs: 244,
          children: [
            {
              name: "RunnableSequence",
              type: "CHAIN",
              startMs: 242,
              durationMs: 241,
              children: [
                {
                  name: "ChatGroq",
                  type: "GENERATION",
                  startMs: 243,
                  durationMs: 238,
                },
                {
                  name: "ChatPromptTemplate",
                  type: "SPAN",
                  startMs: 482,
                  durationMs: 1,
                },
              ],
            },
          ],
        },
      ],
    },
  ]);

export const TIMELINE_SHAPES = {
  reporter: reporterTrace,
  single: singleSpan,
  three: threeSpans,
  deep: () => deepNesting(12),
  long: longTailTrace,
  instantaneous: allInstantaneous,
  missingEnd: missingEndTimes,
  zero: zeroDurationTrace,
  medium: () => manySpans(500),
  huge: () => manySpans(10_000),
} satisfies Record<string, () => LayoutNode[]>;

/**
 * One streaming model call: a quarter of its time waiting for the first token,
 * the rest producing. The wide timeline splits such a bar into two shades; this
 * is the shape that has to keep saying where the split is.
 */
export const streamingSpan = (): LayoutNode[] =>
  build([
    {
      name: "chat.completion",
      type: "GENERATION",
      startMs: 0,
      durationMs: 1000,
      firstTokenMs: 250,
      children: [
        { name: "tokenize", startMs: 10, durationMs: 40 },
        { name: "post-process", startMs: 900, durationMs: 80 },
      ],
    },
  ]);
