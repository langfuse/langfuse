import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import type * as SharedServer from "@langfuse/shared/src/server";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { agentsRouter } from "@/src/features/agents/server/agents-router";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const mocks = vi.hoisted(() => ({
  list: vi.fn(async () => []),
  count: vi.fn(async () => 0),
  metrics: vi.fn(async () => []),
  stats: vi.fn(async () => undefined),
  skills: vi.fn(async () => undefined),
  map: vi.fn(async () => undefined),
  hasAny: vi.fn(async () => false),
}));

vi.mock("@/src/server/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("@/src/features/posthog-analytics/server/backendActivity", () => ({
  recordBackendActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedServer>()),
  getAgentsFromEventsTable: mocks.list,
  getAgentsCountFromEventsTable: mocks.count,
  getAgentMetricsFromEventsTable: mocks.metrics,
  getAgentStatsFromEventsTable: mocks.stats,
  getAgentSkillsFromEventsTable: mocks.skills,
  getAgentMapSkeleton: mocks.map,
  hasAnyAgentFromEventsTable: mocks.hasAny,
}));

function createCaller(projectId = "agent-project") {
  const session = {
    expires: "1",
    user: {
      id: "agent-viewer",
      admin: false,
      canCreateOrganizations: false,
      featureFlags: testFeatureFlags(),
      organizations: [
        {
          id: "agent-org",
          name: "Agent Organization",
          role: "VIEWER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: [
            {
              id: projectId,
              name: "Agent Project",
              role: "VIEWER",
              retentionDays: 30,
              deletedAt: null,
              hasTraces: false,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: null,
    },
  } satisfies Session;
  return agentsRouter.createCaller(
    createInnerTRPCContext({ session, headers: {} }),
  );
}

const scope = {
  projectId: "agent-project",
  from: new Date("2026-10-01T00:00:00Z"),
  to: new Date("2026-10-08T00:00:00Z"),
};

describe("agent router bounds and project access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows read-only project members and forwards the explicit scope to both list queries", async () => {
    const input = { ...scope, page: 2, limit: 50, searchQuery: "planner" };
    await expect(createCaller().allFromEvents(input)).resolves.toEqual({
      agents: [],
      totalAgents: 0,
    });
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith({
      ...input,
      offset: 100,
    });
    expect(mocks.count).toHaveBeenCalledExactlyOnceWith(input);
  });

  it("blocks every agent read across projects before querying storage", async () => {
    const caller = createCaller("other-project");
    const reads = [
      () => caller.hasAnyFromEvents(scope),
      () => caller.allFromEvents({ ...scope, page: 0, limit: 50 }),
      () => caller.metricsFromEvents({ ...scope, agentNames: ["planner"] }),
      () => caller.byNameFromEvents({ ...scope, agentName: "planner" }),
      () => caller.skillsFromEvents({ ...scope, agentName: "planner" }),
      () => caller.mapSkeletonFromEvents({ ...scope, agentName: "planner" }),
    ];
    for (const read of reads) {
      await expect(read()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    for (const mock of Object.values(mocks))
      expect(mock).not.toHaveBeenCalled();
  });

  it("rejects invalid or reversed windows, unbounded pagination and invisible-page metrics", async () => {
    const caller = createCaller();
    for (const window of [
      { from: scope.to, to: scope.from },
      { from: new Date(NaN), to: scope.to },
    ]) {
      await expect(
        caller.byNameFromEvents({ ...scope, ...window, agentName: "planner" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    for (const pagination of [
      { page: -1, limit: 50 },
      { page: 0, limit: 101 },
      { page: 1.5, limit: 50 },
    ]) {
      await expect(
        caller.allFromEvents({ ...scope, ...pagination }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(
      caller.metricsFromEvents({
        ...scope,
        agentNames: Array.from({ length: 101 }, (_, i) => `agent-${i}`),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    for (const mock of Object.values(mocks))
      expect(mock).not.toHaveBeenCalled();
  });

  it("requires text and measures the supported metadata name boundary in Unicode characters", async () => {
    const caller = createCaller();
    const valid = { ...scope, agentName: "🤖".repeat(200) };
    await caller.byNameFromEvents(valid);
    expect(mocks.stats).toHaveBeenCalledExactlyOnceWith(valid);
    for (const agentName of ["🤖".repeat(201), " \t\n"]) {
      await expect(
        caller.byNameFromEvents({ ...scope, agentName }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(mocks.stats).toHaveBeenCalledOnce();
  });

  it("rejects filters that need unsupported dimensions or joins", async () => {
    for (const column of ["scores_avg", "environment", "startTime"]) {
      await expect(
        createCaller().allFromEvents({
          ...scope,
          page: 0,
          limit: 50,
          filter: [{ column, type: "number", operator: ">", value: 0 }],
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });
});
