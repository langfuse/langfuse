import { eventsRouter } from "@/src/features/events/server/eventsRouter";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Session } from "next-auth";
import type * as EnvModule from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { agentsRouter } from "@/src/features/agents/server/agentsRouter";
import { sessionRouter } from "@/src/server/api/routers/sessions";
import type * as AgentsServerModule from "@langfuse/shared/agents/server";

const queries = vi.hoisted(() => ({
  listAgents: vi.fn(),
  getAgentDetail: vi.fn(),
  getAgentEnvironments: vi.fn(),
  getAgentRuns: vi.fn(),
  getAgentTraces: vi.fn(),
  getAgentSkills: vi.fn(),
  getAgentInfo: vi.fn(),
  getAgentActivity: vi.fn(),
  getAgentListActivity: vi.fn(),
  getAgentSkillsActivity: vi.fn(),
  getAgentEventsActivity: vi.fn(),
  getAgentSessionsActivity: vi.fn(),
  buildAgentCountActivityResult: vi.fn(),
  getAgentOverview: vi.fn(),
  getAgentQualityOptions: vi.fn(),
  getAgentQuality: vi.fn(),
  getAgentRelationships: vi.fn(),
}));
vi.mock("@langfuse/shared/agents/server", async (importOriginal) => ({
  ...(await importOriginal<typeof AgentsServerModule>()),
  ...queries,
}));
vi.mock("@/src/server/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("@/src/features/posthog-analytics/server/backendActivity", () => ({
  recordBackendActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/src/env.mjs", async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return {
    ...actual,
    env: { ...actual.env, LANGFUSE_MIGRATION_V4_WRITE_MODE: "dual" },
  };
});

const scope = {
  projectId: "project",
  from: new Date("2026-11-01T00:00:00Z"),
  to: new Date("2026-11-02T00:00:00Z"),
  environment: "production",
};
const detail = {
  ...scope,
  identity: { kind: "id" as const, value: "agent-1" },
};

function testContext({
  enabled = true,
  projectId = "project",
  role = "VIEWER",
  experimental = false,
  v4BetaEnabled = true,
}: {
  enabled?: boolean;
  projectId?: string;
  role?: "VIEWER" | "MEMBER" | "AI_GATEWAY";
  experimental?: boolean;
  v4BetaEnabled?: boolean;
} = {}) {
  const session = {
    expires: "1",
    user: {
      id: "user",
      admin: false,
      v4BetaEnabled,
      featureFlags: testFeatureFlags({ agentsView: enabled }),
      organizations: [{ id: "org", role, projects: [{ id: projectId, role }] }],
    },
    environment: { enableExperimentalFeatures: experimental },
  } as Session;
  return createInnerTRPCContext({ session, headers: {} });
}

const caller = (options?: Parameters<typeof testContext>[0]) =>
  agentsRouter.createCaller(testContext(options));

describe("Agents preview access and bounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires an explicit grant for every endpoint, including on experimental deployments", async () => {
    const denied = caller({ enabled: false, experimental: true });
    const requests = [
      () => denied.list(scope),
      () => denied.environments(scope),
      () => denied.detail(detail),
      () => denied.runs(detail),
      () => denied.traces(detail),
      () => denied.skills(detail),
      () => denied.info(detail),
      () => denied.activity({ ...scope, identities: [detail.identity] }),
      () => denied.listActivity(scope),
      () => denied.skillsActivity(detail),
      () => denied.overview(detail),
      () => denied.qualityOptions(detail),
      () =>
        denied.quality({
          ...detail,
          score: {
            name: "quality",
            dataType: "NUMERIC",
            source: "API",
            configId: null,
          },
        }),
      () => denied.relationships(detail),
    ];
    for (const request of requests) {
      await expect(request()).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    for (const query of Object.values(queries))
      expect(query).not.toHaveBeenCalled();
  });

  it("requires the Agents grant when standard Tracing endpoints receive an immutable agent scope", async () => {
    const reader = eventsRouter.createCaller(
      testContext({ enabled: false, experimental: true }),
    );
    const agentScope = {
      identity: detail.identity,
      from: scope.from,
      to: scope.to,
      environment: scope.environment,
    };
    const base = {
      projectId: scope.projectId,
      agentScope,
      filter: [],
      searchQuery: null,
      searchType: [],
      orderBy: null,
    };
    for (const request of [
      () => reader.all({ ...base, page: 1, limit: 20 }),
      () => reader.countAll(base),
      () => reader.agentActivity(base),
      () => reader.filterOptions({ projectId: scope.projectId, agentScope }),
      () =>
        reader.metadataValues({
          projectId: scope.projectId,
          agentScope,
          key: "key",
        }),
    ])
      await expect(request()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      sessionRouter
        .createCaller(testContext({ enabled: false }))
        .agentActivity({
          projectId: scope.projectId,
          agentScope,
          filter: [],
          orderBy: null,
        }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects Agents and scoped native tables when the session still reads legacy data", async () => {
    await expect(
      caller({ enabled: true, v4BetaEnabled: false }).list(scope),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const native = eventsRouter.createCaller(
      testContext({ enabled: true, v4BetaEnabled: false }),
    );
    await expect(
      native.countAll({
        projectId: scope.projectId,
        agentScope: {
          identity: detail.identity,
          from: scope.from,
          to: scope.to,
          environment: scope.environment,
        },
        filter: [],
        searchQuery: null,
        searchType: [],
        orderBy: null,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("denies cross-project and restricted-role reads before querying telemetry", async () => {
    await expect(
      caller({ projectId: "other-project" }).list(scope),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller({ role: "AI_GATEWAY" }).list(scope),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(queries.listAgents).not.toHaveBeenCalled();
  });

  it("matches native score reading for a granted project member", async () => {
    queries.getAgentQualityOptions.mockResolvedValue({
      items: [],
      hasMore: false,
    });
    await expect(
      caller({ role: "MEMBER" }).qualityOptions(detail),
    ).resolves.toEqual({ items: [], hasMore: false });
    expect(queries.getAgentQualityOptions).toHaveBeenCalledExactlyOnceWith(
      detail,
    );
  });

  it.each(["VIEWER", "MEMBER"] as const)(
    "allows a granted %s to read the selected project and environment",
    async (role) => {
      await caller({ role }).list(scope);
      expect(queries.listAgents).toHaveBeenCalledExactlyOnceWith({
        ...scope,
        page: 0,
        pageSize: 20,
        sort: "lastSeen",
        direction: "desc",
      });
    },
  );

  it("rejects unbounded windows, invalid identities, and excessive pages", async () => {
    const reader = caller();
    for (const override of [
      { to: scope.from },
      { to: new Date("2026-12-02T00:00:00Z") },
      { pageSize: 101 },
      { page: -1 },
      { page: 1001 },
      {
        filter: [
          {
            column: "displayName" as const,
            type: "string" as const,
            operator: "contains" as const,
            value: "x".repeat(257),
          },
        ],
      },
      {
        environmentFilter: [
          {
            column: "environment" as const,
            type: "stringOptions" as const,
            operator: "any of" as const,
            value: Array.from({ length: 101 }, (_, i) => `env-${i}`),
          },
        ],
      },
    ]) {
      await expect(
        reader.list({ ...scope, ...override }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(
      reader.detail({
        ...detail,
        identity: { kind: "id", value: "a".repeat(257) },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(queries.listAgents).not.toHaveBeenCalled();
    expect(queries.getAgentDetail).not.toHaveBeenCalled();
    for (const override of [
      { identities: [] },
      { identities: [detail.identity, detail.identity] },
      { identities: [detail.identity], bucketCount: 101 },
      { identities: [detail.identity], bucketCount: 0 },
      {
        identities: Array.from({ length: 101 }, (_, i) => ({
          kind: "id" as const,
          value: `agent-${i}`,
        })),
      },
    ])
      await expect(
        reader.activity({ ...scope, ...override }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(queries.getAgentActivity).not.toHaveBeenCalled();
  });

  it("accepts the same Unicode identities as ingestion", async () => {
    const reader = caller();
    for (const identity of [
      { kind: "id" as const, value: "🤖".repeat(256) },
      { kind: "name" as const, value: "🤖".repeat(200) },
    ]) {
      await reader.detail({ ...scope, identity });
      expect(queries.getAgentDetail).toHaveBeenLastCalledWith({
        ...scope,
        identity,
      });
      await expect(
        reader.detail({
          ...scope,
          identity: { ...identity, value: `${identity.value}x` },
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(queries.getAgentDetail).toHaveBeenCalledTimes(2);
  });

  it("links only exact managed versions and leaves unresolved observed loads visible", async () => {
    const base = {
      name: "observed-name",
      filePath: "SKILL.md",
      loads: 1,
      traces: 1,
      firstSeen: scope.from,
      lastSeen: scope.to,
      sampleTraceIds: ["trace"],
    };
    queries.getAgentSkills.mockResolvedValue({
      items: [
        { ...base, skillId: "managed", skillVersion: 2 },
        { ...base, skillId: "managed", skillVersion: 1 },
        { ...base, skillId: "foreign", skillVersion: 2 },
        { ...base, skillId: null, skillVersion: 2 },
      ],
      totalCount: 4,
      page: 0,
      pageSize: 20,
    });
    const find = vi
      .spyOn(prisma.skill, "findMany")
      .mockResolvedValue([
        { id: "managed", name: "canonical-name", version: 2 },
      ] as never);
    try {
      const result = await caller().skills(detail);
      expect(find).toHaveBeenCalledExactlyOnceWith({
        where: {
          projectId: "project",
          OR: [
            { id: "managed", version: 2 },
            { id: "managed", version: 1 },
            { id: "foreign", version: 2 },
          ],
        },
        select: { id: true, name: true, version: true },
      });
      expect(result.items.map((row) => row.managedSkill)).toEqual([
        { name: "canonical-name", version: 2 },
        null,
        null,
        null,
      ]);
      expect(result.items[0]?.name).toBe("observed-name");
    } finally {
      find.mockRestore();
    }
  });
});
