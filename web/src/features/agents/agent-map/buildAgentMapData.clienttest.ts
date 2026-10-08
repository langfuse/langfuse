// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type AgentMapSkeletonRow } from "@langfuse/shared";
import { buildAgentMapData } from "./buildAgentMapData";

const row = (
  spanId: string,
  parentSpanId: string | null,
  agentName: string | null,
  traceId = "trace-1",
  type: AgentMapSkeletonRow["type"] = "AGENT",
): AgentMapSkeletonRow => ({
  traceId,
  spanId,
  parentSpanId,
  agentName,
  type,
  startTime: new Date("2026-10-08T10:00:00Z"),
});

describe("buildAgentMapData", () => {
  it("walks intermediary observations and aggregates calls and distinct traces", () => {
    const map = buildAgentMapData(
      [
        row("root", null, "orchestrator"),
        row("tool", "root", "orchestrator", "trace-1", "TOOL"),
        row("research-1", "tool", "research"),
        row("research-2", "tool", "research"),
        row("root", null, "orchestrator", "trace-2"),
        row("research-1", "root", "research", "trace-2"),
      ],
      "research",
      false,
    );
    expect(map.edges).toEqual([
      expect.objectContaining({
        from: "agent:orchestrator",
        to: "agent:research",
        count: 3,
        traceCount: 2,
        traceIds: ["trace-1", "trace-2"],
        weight: 1 + Math.log2(3),
        label: "×3",
      }),
    ]);
  });

  it("keeps span identities scoped to a trace and deduplicates rewritten runs", () => {
    const map = buildAgentMapData(
      [
        row("root", null, "caller-1"),
        row("run", "root", "research"),
        row("run", "root", "research"),
        row("root", null, "caller-2", "trace-2"),
        row("run", "root", "research", "trace-2"),
      ],
      "research",
      false,
    );
    expect(map.edges.map((edge) => [edge.from, edge.count])).toEqual([
      ["agent:caller-1", 1],
      ["agent:caller-2", 1],
    ]);
    expect(map.diagnostics.duplicateRows).toBe(1);
  });

  it("distinguishes known roots, missing ancestors and unnamed AGENT boundaries", () => {
    const map = buildAgentMapData(
      [
        row("known-root", null, "research"),
        row("missing", "not-loaded", "research"),
        row("empty-parent", "", "research"),
        row("unnamed", null, null),
        row("named-child", "unnamed", "research"),
      ],
      "research",
      false,
    );
    expect(map.edges.map((edge) => [edge.from, edge.count])).toEqual([
      ["boundary:unknown", 2],
      ["boundary:root", 1],
      ["boundary:unnamed", 1],
    ]);
    expect(map.diagnostics.missingParentRuns).toBe(2);
  });

  it("terminates malformed parent cycles without inventing named caller edges", () => {
    const map = buildAgentMapData(
      [
        row("a", "b", "research"),
        row("b", "a", "composer"),
        row("self", "self", "research"),
        row("chain-child", "chain-1", "research"),
        row("chain-1", "chain-2", null, "trace-1", "SPAN"),
        row("chain-2", "chain-1", null, "trace-1", "SPAN"),
      ],
      "research",
      false,
    );
    expect(map.edges).toEqual([
      expect.objectContaining({
        from: "boundary:unknown",
        to: "agent:research",
        count: 3,
      }),
    ]);
    expect(map.diagnostics.cyclicParentRuns).toBe(4);
  });

  it("filters edges touching the current agent and safely distinguishes reserved-looking names", () => {
    const rows = [
      row("root", null, "(root)"),
      row("research", "root", "research"),
      row("compose", "root", "composer"),
    ];
    const focused = buildAgentMapData(rows, "research", false);
    expect(focused.edges).toHaveLength(1);
    expect(focused.nodes.find((node) => node.agentName === "(root)")?.id).toBe(
      "agent:(root)",
    );
    const all = buildAgentMapData(rows, "research", true);
    expect(all.edges).toHaveLength(3);
    expect(all.nodes.some((node) => node.id === "boundary:root")).toBe(true);
  });

  it("handles a deep ancestry chain without recursion or quadratic rewalking", () => {
    const rows: AgentMapSkeletonRow[] = [row("root", null, "orchestrator")];
    for (let i = 1; i <= 10_000; i++)
      rows.push(
        row(
          `span-${i}`,
          i === 1 ? "root" : `span-${i - 1}`,
          null,
          "trace-1",
          "SPAN",
        ),
      );
    rows.push(
      row("research", "span-10000", "research"),
      row("research-2", "span-9999", "research"),
    );
    expect(buildAgentMapData(rows, "research", false).edges).toEqual([
      expect.objectContaining({
        from: "agent:orchestrator",
        to: "agent:research",
        count: 2,
      }),
    ]);
  });
});
