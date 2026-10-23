// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  haloAsksOf,
  readingOf,
  tipFor,
  turnSummaryOf,
  typesOf,
  waterfallOf,
} from "./firstTrace";
import type { FirstTrace, FirstTraceNode } from "./types";

const at = (ms: number) => new Date(Date.UTC(2026, 9, 21, 9, 0, 0, ms));

const step = (
  id: string,
  type: FirstTraceNode["type"],
  name: string,
  [startMs, endMs]: [number, number],
  children: FirstTraceNode[] = [],
): FirstTraceNode => ({
  id,
  type,
  name,
  startTime: at(startMs),
  endTime: at(endMs),
  children,
});

describe("waterfallOf", () => {
  it("places each step inside the wrapper on the timeline, in tree order", () => {
    const { rows, hiddenCount } = waterfallOf([
      step(
        "root",
        "SPAN",
        "chat-completion",
        [0, 1000],
        [
          step("gen", "GENERATION", "openai.chat", [200, 1000]),
          step("ret", "RETRIEVER", "retrieve-context", [0, 200]),
        ],
      ),
    ]);
    expect(hiddenCount).toBe(0);
    expect(rows.map(({ node, depth }) => [node.id, depth])).toEqual([
      ["ret", 0],
      ["gen", 0],
    ]);
    expect(rows[1]).toMatchObject({ start: 0.2, share: 0.8, durationMs: 800 });
  });

  it("keeps three rows and counts the rest", () => {
    const children = Array.from({ length: 9 }, (_, index) =>
      step(`tool-${index}`, "TOOL", "Tool: Read", [index * 10, index * 10 + 5]),
    );
    const { rows, hiddenCount } = waterfallOf([
      step("root", "AGENT", "Codex Turn", [0, 100], children),
    ]);
    expect(rows).toHaveLength(3);
    expect(hiddenCount).toBe(6);
  });

  it("keeps a failed step in view, in the last row", () => {
    const children = Array.from({ length: 5 }, (_, index) => ({
      ...step(`step-${index}`, "SPAN", "step", [index * 10, index * 10 + 5]),
      level: index === 4 ? ("ERROR" as const) : ("DEFAULT" as const),
    }));
    const { rows, hiddenCount } = waterfallOf([
      step("root", "SPAN", "pipeline", [0, 100], children),
    ]);
    expect(rows.map(({ node }) => node.id)).toEqual([
      "step-0",
      "step-1",
      "step-4",
    ]);
    expect(hiddenCount).toBe(2);
  });

  it("brings the first LLM call into view when the first rows miss it", () => {
    const { rows } = waterfallOf([
      step(
        "root",
        "SPAN",
        "chat",
        [0, 100],
        [
          step(
            "ret",
            "RETRIEVER",
            "retrieve",
            [0, 20],
            [
              step("emb", "EMBEDDING", "embed", [0, 10]),
              step("rank", "SPAN", "rerank", [10, 20]),
            ],
          ),
          step("gen", "GENERATION", "answer", [20, 100]),
        ],
      ),
    ]);
    expect(rows.map(({ node }) => node.id)).toEqual(["ret", "emb", "gen"]);
  });

  it("gives an instant trace no width instead of dividing by zero", () => {
    const { rows } = waterfallOf([step("event", "EVENT", "log", [0, 0])]);
    expect(rows[0]).toMatchObject({ start: 0, share: 0 });
  });
});

describe("typesOf", () => {
  it("names the two most telling kinds of step", () => {
    expect(
      typesOf([
        step("root", "SPAN", "chat", [0, 10]),
        step("emb", "EMBEDDING", "embed", [0, 1]),
        step("ret", "RETRIEVER", "retrieve", [0, 2]),
        step("gen", "GENERATION", "answer", [2, 10]),
      ]),
    ).toEqual(["GENERATION", "RETRIEVER"]);
  });
});

describe("turnSummaryOf", () => {
  it("counts steps, tool calls and warnings inside the turn, nested ones too", () => {
    const summary = turnSummaryOf([
      step(
        "root",
        "AGENT",
        "Cursor Turn",
        [0, 100],
        [
          step("llm", "GENERATION", "LLM", [0, 0]),
          step("a", "TOOL", "Tool: Read", [0, 0]),
          step("b", "TOOL", "Tool: Read", [0, 0]),
          {
            ...step(
              "task",
              "TOOL",
              "Task",
              [0, 50],
              [
                step("c", "TOOL", "Bash", [10, 20]),
                step("d", "TOOL", "Tool: Edit", [20, 30]),
              ],
            ),
            level: "WARNING",
          },
        ],
      ),
    ]);
    expect(summary).toEqual({
      steps: 6,
      toolCalls: 5,
      topTools: [
        { name: "Read", count: 2 },
        { name: "Task", count: 1 },
        { name: "Bash", count: 1 },
      ],
      warnings: 1,
    });
  });
});

describe("tipFor", () => {
  const generation = {
    ...step("gen", "GENERATION", "answer", [0, 10]),
    model: "gpt-4o-mini",
  };
  const trace = (overrides: Partial<FirstTrace>): FirstTrace => ({
    id: "t",
    name: "chat",
    href: "#",
    source: { kind: "app" },
    totalTokens: 10,
    costUsd: 0.001,
    io: { input: "hi", output: "hello" },
    roots: [step("root", "SPAN", "chat", [0, 10], [generation])],
    ...overrides,
  });

  it("has nothing to say about a healthy trace", () => {
    expect(tipFor(trace({}))).toBeNull();
  });

  it("asks for generations first, when no LLM call is one", () => {
    expect(
      tipFor(
        trace({ roots: [step("root", "SPAN", "chat", [0, 10])], io: null }),
      )?.href,
    ).toContain("#track-model-tokens-and-cost-on-generations");
  });

  it("points at pricing when a model has no price", () => {
    expect(tipFor(trace({ costUsd: null }))?.action).toBe("Add its price");
  });

  it("asks for input and output when the trace has none", () => {
    expect(tipFor(trace({ io: null }))?.href).toContain(
      "#choose-meaningful-input-and-output",
    );
  });
});

describe("haloAsksOf", () => {
  const trace = (overrides: Partial<FirstTrace>): FirstTrace => ({
    id: "t",
    name: "chat",
    href: "#",
    source: { kind: "app" },
    totalTokens: 10,
    costUsd: 0.001,
    io: null,
    roots: [
      step(
        "root",
        "SPAN",
        "chat",
        [0, 1240],
        [
          step("ret", "RETRIEVER", "retrieve-context", [0, 180]),
          step("gen", "GENERATION", "openai.chat", [200, 1240]),
        ],
      ),
    ],
    ...overrides,
  });

  it("asks about the app trace's slowest step by name and length", () => {
    expect(haloAsksOf(trace({}))).toEqual([
      "Score every answer like this one",
      "Why did openai.chat take 1.04s?",
      "Save this trace as a test case",
    ]);
  });

  it("asks about a coding agent's turn as a whole", () => {
    expect(
      haloAsksOf(
        trace({
          source: { kind: "agent", slug: "claude-code", sessionHref: "#" },
        }),
      )[1],
    ).toBe("What made this turn take 1.24s?");
  });
});

describe("readingOf", () => {
  const roots = [
    step(
      "root",
      "SPAN",
      "chat",
      [0, 100],
      [
        step("ret", "RETRIEVER", "retrieve", [0, 20]),
        step("gen", "GENERATION", "answer", [20, 100]),
      ],
    ),
  ];
  const trace = (source: FirstTrace["source"]): FirstTrace => ({
    id: "t",
    name: "chat",
    href: "#",
    source,
    totalTokens: 10,
    costUsd: 0.001,
    io: { input: "hi", output: "hello" },
    roots,
  });

  it("reads an app trace as a waterfall of its visible rows", () => {
    expect(readingOf(trace({ kind: "app" })).receipt).toMatchObject({
      kind: "waterfall",
      hiddenCount: 0,
      types: ["GENERATION", "RETRIEVER"],
    });
  });

  it("reads a coding agent's turn as what was asked and what it did", () => {
    expect(
      readingOf(trace({ kind: "agent", slug: "claude-code", sessionHref: "#" }))
        .receipt,
    ).toMatchObject({ kind: "turn", input: "hi", summary: { steps: 2 } });
  });
});
