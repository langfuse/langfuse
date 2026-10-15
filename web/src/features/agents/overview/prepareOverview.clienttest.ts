import {
  decodeFiltersGeneric,
  type AgentProjectionTool,
  type FilterState,
} from "@langfuse/shared";
import {
  activityBuckets,
  agentPath,
  comparisonSeries,
  metricValue,
  prepareAgents,
  prepareSessionBars,
  sessionPath,
} from "./prepareOverview";
import {
  prepareRelationships,
  relationshipLayout,
} from "./prepareRelationships";
import { agent, FROM, projection, session, stats, TO } from "./testFixtures";
const tool = (
  agentName: string,
  name: string,
  available = false,
): AgentProjectionTool => ({
  agentName,
  name,
  invocations: 1,
  sessions: 1,
  traces: 1,
  lastUsed: FROM,
  available,
});

describe("agent overview preparation", () => {
  it("keeps dormant discovery agents, ranks only loaded rows, and counts distinct used skills", () => {
    const value = projection({
      agents: [
        agent("dormant", { state: "dormant" }),
        agent("expensive", { current: stats({ cost: 5 }) }),
        agent("attention", {
          signals: [
            { kind: "missing-tools", message: "Inspect", sessionIds: ["s"] },
          ],
        }),
      ],
      skills: [
        {
          ...tool("attention", "native"),
          source: "native",
          sampleTraceIds: [],
        },
        { ...tool("attention", "native"), source: "mixed", sampleTraceIds: [] },
        {
          ...tool("attention", "unused"),
          invocations: 0,
          source: "tool-name-preview",
          sampleTraceIds: [],
        },
      ],
    });
    const rows = prepareAgents(value, "all", "attention");
    expect(rows.map((row) => row.agentName)).toEqual([
      "attention",
      "dormant",
      "expensive",
    ]);
    expect(metricValue(rows[0], "skills")).toBe(1);
    expect(
      prepareAgents(value, "dormant", "cost").map((row) => row.agentName),
    ).toEqual(["dormant"]);
    expect(prepareAgents(value, "all", "cost")[0].agentName).toBe("expensive");
    expect(metricValue(rows[0], "duration")).toBeNull();
  });
  it("packs overlapping sessions, clamps both window edges, and keeps zero-duration evidence finite", () => {
    const rows = [
      session("before", { firstSeen: new Date(FROM.getTime() - 1000) }),
      session("overlap"),
      session("last", { firstSeen: new Date(TO.getTime() - 1), lastSeen: TO }),
      session("outside", {
        firstSeen: TO,
        lastSeen: new Date(TO.getTime() + 1),
      }),
      session("baseline", { inWindow: false }),
    ];
    const { bars, tracks } = prepareSessionBars(rows, FROM, TO);
    expect(bars.map((bar) => bar.session.id)).toEqual([
      "before",
      "overlap",
      "last",
    ]);
    expect(tracks).toBe(2);
    for (const bar of bars) {
      expect(bar.start).toBeGreaterThanOrEqual(0);
      expect(bar.width).toBeGreaterThan(0);
      expect(bar.start + bar.width).toBeLessThanOrEqual(1);
    }
    expect(prepareSessionBars(rows, TO, FROM).bars).toEqual([]);
  });
  it("does not turn missing truncated activity buckets into zero activity", () => {
    const value = projection({
      coverage: { ...projection().coverage, groupsTruncated: true },
      activity: [
        {
          agentName: "research",
          timestamp: FROM,
          sessions: 1,
          invocations: 2,
          toolInvocations: 3,
          observations: 4,
          skillInvocations: 0,
          cost: 0,
          tokens: 0,
        },
      ],
    });
    const buckets = activityBuckets(value, "research", 4);
    expect(buckets).toHaveLength(4);
    expect(buckets[0].count).toBe(2);
    expect(buckets[1].count).toBeNull();
    expect(activityBuckets(projection(), "research", 4)[1].count).toBe(0);
  });
  it("uses only complete real-session cohorts and actual trailing samples for comparisons", () => {
    const sessions = Array.from({ length: 6 }, (_, i) =>
      session(`b${i}`, {
        firstSeen: new Date(FROM.getTime() + i),
        toolInvocations: i + 1,
        comparisonPeriod: "baseline",
      }),
    );
    const points = comparisonSeries(
      projection({
        sessions: [
          ...sessions,
          session("recent", { toolInvocations: 0 }),
          session("fallback", { kind: "trace", toolInvocations: 999 }),
          session("partial", {
            completePerSession: false,
            toolInvocations: 999,
          }),
          session("other", { agentName: "other", toolInvocations: 999 }),
        ],
      }),
      "research",
    );
    expect(points).toHaveLength(6);
    expect(points.at(-1)?.values).toEqual({ baseline: 4, recent: 0 });
    expect(comparisonSeries(projection(), "research")).toEqual([]);
  });
  it("preserves exact agent name, closed window and environment on profile, signal and session links", () => {
    const filter: FilterState = [
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      },
    ];
    const scope = { projectId: "p", from: FROM, to: TO, filter };
    const url = new URL(
      agentPath(scope, "..", { tab: "sessions", agentSignal: "tool-change" }),
      "http://local",
    );
    expect(url.pathname).toBe("/project/p/agents");
    expect(url.searchParams.get("agentName")).toBe("..");
    expect(url.searchParams.get("agentSignal")).toBe("tool-change");
    expect(decodeFiltersGeneric(url.searchParams.get("filter")!)).toEqual(
      filter,
    );
    const peek = new URL(sessionPath(scope, session("s/a")), "http://local");
    expect(peek.searchParams.get("peek")).toBe("s/a");
    expect(peek.searchParams.get("tab")).toBe("sessions");
    expect(peek.searchParams.get("dateRange")).toBe(
      `${FROM.getTime()}-${TO.getTime()}`,
    );
    expect(
      sessionPath(
        scope,
        session("t", { kind: "trace", traceId: "trace", sessionId: null }),
      ),
    ).toContain("/traces/trace");
  });
  it("separates observed execution from shared declared availability, without inferring causality", () => {
    const call = {
      source: "a",
      target: "a",
      kind: "calls" as const,
      weight: 3,
      evidence: ["trace"],
      provenance: "trace-ancestry" as const,
    };
    const value = projection({
      tools: [
        tool("a", "available", true),
        tool("b", "available", true),
        tool("a", "executed"),
        tool("b", "executed"),
      ],
      relationships: [
        call,
        {
          source: "a",
          target: "b",
          kind: "tools",
          weight: 1,
          evidence: ["executed"],
          provenance: "observed-tools",
        },
      ],
    });
    expect(prepareRelationships(value, "calls", ["a", "b"])).toEqual([call]);
    expect(
      prepareRelationships(value, "tools", ["a", "b"])[0].evidence,
    ).toEqual(["executed"]);
    const available = prepareRelationships(value, "available-tools", [
      "a",
      "b",
    ]);
    expect(available).toHaveLength(1);
    expect(available[0].evidence).toEqual(["available"]);
    expect(prepareRelationships(value, "available-tools", ["a"])).toEqual([]);
    expect(
      relationshipLayout(["b", "a", "a"]).nodes.map((node) => node.name),
    ).toEqual(["a", "b"]);
  });
});
