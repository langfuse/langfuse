import { computeRunStats } from "@/src/features/playground/page/utils/runStats";
import { type PlaygroundRunResult } from "@/src/features/playground/page/types";

const completedRun = (
  index: number,
  overrides: Partial<PlaygroundRunResult> = {},
): PlaygroundRunResult => ({
  index,
  status: "completed",
  content: "hello",
  toolCalls: [],
  latencyMs: 100,
  ...overrides,
});

describe("computeRunStats", () => {
  it("counts completed and failed runs and aggregates latency", () => {
    const stats = computeRunStats([
      completedRun(0, { latencyMs: 100 }),
      completedRun(1, { latencyMs: 300 }),
      {
        index: 2,
        status: "error",
        content: "",
        toolCalls: [],
        latencyMs: 50,
        error: "boom",
      },
    ]);

    expect(stats.totalCount).toBe(3);
    expect(stats.completedCount).toBe(2);
    expect(stats.errorCount).toBe(1);
    expect(stats.latency).toEqual({ min: 100, avg: 200, max: 300 });
  });

  it("counts runs per tool-call signature including argument shape", () => {
    const stats = computeRunStats([
      completedRun(0, {
        toolCalls: [
          { id: "a", name: "validate_customer", args: { document: "1" } },
        ],
      }),
      completedRun(1, {
        toolCalls: [
          { id: "b", name: "validate_customer", args: { document: "2" } },
          // second call of the same signature within one run counts once
          { id: "c", name: "validate_customer", args: { document: "3" } },
        ],
      }),
      completedRun(2, {
        toolCalls: [
          { id: "d", name: "validate_customer", args: { birthday: "1990" } },
        ],
      }),
      completedRun(3),
    ]);

    expect(stats.toolCallFrequencies).toEqual([
      { signature: "validate_customer(document)", runCount: 2 },
      { signature: "validate_customer(birthday)", runCount: 1 },
    ]);
  });

  it("counts distinct outputs after whitespace normalization", () => {
    const stats = computeRunStats([
      completedRun(0, { content: "same  answer" }),
      completedRun(1, { content: "same answer" }),
      completedRun(2, { content: "different answer" }),
    ]);

    expect(stats.distinctOutputCount).toBe(2);
  });

  it("treats identical text with different tool calls as distinct outputs", () => {
    const stats = computeRunStats([
      completedRun(0, {
        toolCalls: [{ id: "a", name: "generate_deal", args: { amount: 1 } }],
      }),
      completedRun(1, {
        toolCalls: [{ id: "b", name: "generate_deal", args: { amount: 2 } }],
      }),
    ]);

    expect(stats.distinctOutputCount).toBe(2);
  });

  it("returns null latency and empty frequencies when nothing completed", () => {
    const stats = computeRunStats([
      {
        index: 0,
        status: "running",
        content: "",
        toolCalls: [],
        latencyMs: 0,
      },
    ]);

    expect(stats.latency).toBeNull();
    expect(stats.toolCallFrequencies).toEqual([]);
    expect(stats.distinctOutputCount).toBe(0);
  });
});
