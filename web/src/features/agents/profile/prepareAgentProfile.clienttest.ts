import {
  type AgentProjectionActivity,
  type AgentProjectionSession,
} from "@langfuse/shared";
import {
  prepareAgentProfileChart,
  prepareAgentSessionRows,
} from "./prepareAgentProfile";

const from = new Date("2026-10-15T14:00:00Z");
const to = new Date("2026-10-15T15:00:00Z");
const session = (
  id: string,
  overrides: Partial<AgentProjectionSession> = {},
): AgentProjectionSession => ({
  id,
  kind: "session",
  agentName: "research",
  sessionId: id,
  traceId: null,
  traceCount: 1,
  sampleTraceIds: ["trace"],
  participatingAgentNames: ["research"],
  firstSeen: from,
  lastSeen: from,
  sessionFirstSeen: from,
  sessionLastSeen: from,
  agentObservedDurationMs: 1000,
  sessionElapsedMs: 2000,
  invocations: 2,
  toolInvocations: 3,
  observationCount: 8,
  cost: 0.1,
  tokens: 50,
  toolNames: ["search"],
  skillNames: [],
  windowCost: 0.1,
  windowTokens: 50,
  windowInvocations: 2,
  windowToolInvocations: 3,
  windowObservationCount: 8,
  completePerSession: true,
  completenessReason: "complete",
  inWindow: true,
  comparisonPeriod: "recent",
  ...overrides,
});

test("session exploration preserves membership, sessionless activity and exact identities", () => {
  const sharedA = session("shared");
  const sharedB = session("shared", { agentName: "compose" });
  const rows = prepareAgentSessionRows({
    sessions: [
      sharedA,
      sharedB,
      session("baseline", { inWindow: false }),
      session("unlinked", {
        kind: "trace",
        sessionId: null,
        traceId: "trace",
        completePerSession: false,
        completenessReason: "missing-session-id",
      }),
    ],
    agentName: "research",
    search: "",
    signalSessionIds: null,
  });
  expect(rows.map((row) => row.id)).toEqual(["shared", "unlinked"]);
  expect(rows[0]?.invocations).toBe(2);
  expect(
    prepareAgentSessionRows({
      sessions: [sharedA],
      agentName: "Research",
      search: "",
      signalSessionIds: null,
    }),
  ).toEqual([]);
});

test("signal drilldown contains only supporting real sessions and respects search", () => {
  const rows = prepareAgentSessionRows({
    sessions: [
      session("usual"),
      session("expensive-1"),
      session("expensive-2"),
      session("trace", { kind: "trace", sessionId: null }),
    ],
    agentName: "research",
    search: "-2",
    signalSessionIds: ["expensive-1", "expensive-2", "trace"],
  });
  expect(rows.map((row) => row.id)).toEqual(["expensive-2"]);
});

test("contextual charts use the selected unit and retain gaps", () => {
  const activity: AgentProjectionActivity[] = [
    {
      agentName: "research",
      timestamp: from,
      sessions: 1,
      invocations: 2,
      toolInvocations: 5,
      observations: 10,
      skillInvocations: 3,
      cost: 0.1,
      tokens: 20,
    },
    {
      agentName: "compose",
      timestamp: from,
      sessions: 9,
      invocations: 9,
      toolInvocations: 90,
      observations: 100,
      skillInvocations: 20,
      cost: 1,
      tokens: 200,
    },
  ];
  const prepare = (tab: "sessions" | "skills" | "tools" | "runs") =>
    prepareAgentProfileChart({
      activity,
      agentName: "research",
      tab,
      window: { from, to },
      bucketMs: 30 * 60_000,
      widthPx: 600,
    });
  expect(prepare("sessions").dense.map((bin) => bin.value)).toEqual([1, null]);
  expect(prepare("runs").dense[0]?.value).toBe(2);
  expect(prepare("tools").dense[0]?.value).toBe(5);
  expect(prepare("skills").dense[0]?.value).toBe(3);
});
