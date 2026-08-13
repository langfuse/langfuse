import type { Session } from "next-auth";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { v4TransitionRouter } from "@/src/features/v4/server/v4TransitionRouter";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { queryClickhouse } from "@langfuse/shared/src/server";

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: vi.fn(),
}));

const sharedServerMock = vi.hoisted(() => ({
  queryClickhouse: vi.fn(),
  isForceV3ExperienceProject: vi.fn(() => false),
  logger: {
    warn: vi.fn(),
  },
  INTERNAL_INGESTION_SDK_NAMES: [
    "langfuse-internal-ai-sdk",
    "langfuse-internal-otel-writer",
  ],
  convertDateToClickhouseDateTime: (date: Date) =>
    date.toISOString().replace("T", " ").replace("Z", ""),
  systemTableRef: (table: "system.processes" | "system.query_log") =>
    `clusterAllReplicas('test-cluster', '${table}')`,
  classifyIngestionSdkVersion: ({
    sdkName,
    sdkVersion,
  }: {
    sdkName: string | null | undefined;
    sdkVersion: string | null | undefined;
  }) => {
    const normalizedSdkName = sdkName?.trim().toLowerCase();
    const normalizedSdkVersion = sdkVersion?.trim();

    if (
      !normalizedSdkName ||
      !normalizedSdkVersion ||
      normalizedSdkName === "unknown" ||
      normalizedSdkVersion === "unknown"
    ) {
      return {
        canonicalSdkName: null,
        latestMajor: null,
        major: null,
        status: "unknown",
      };
    }

    const canonicalSdkName =
      normalizedSdkName === "python" || normalizedSdkName === "langfuse-python"
        ? "python"
        : normalizedSdkName === "javascript" ||
            normalizedSdkName.startsWith("@langfuse/")
          ? "javascript"
          : null;

    if (!canonicalSdkName) {
      return {
        canonicalSdkName: null,
        latestMajor: null,
        major: null,
        status: "unsupported_sdk",
      };
    }

    const major = Number(normalizedSdkVersion.match(/^v?(\d+)/)?.[1]);
    const latestMajor = canonicalSdkName === "python" ? 4 : 5;

    if (!Number.isFinite(major)) {
      return {
        canonicalSdkName,
        latestMajor,
        major: null,
        status: "invalid_version",
      };
    }

    return {
      canonicalSdkName,
      latestMajor,
      major,
      status: major >= latestMajor ? "current" : "outdated_major",
    };
  },
  classifyIngestionSdkAttribution: ({
    sdkName,
    sdkVersion,
  }: {
    sdkName: string | null | undefined;
    sdkVersion: string | null | undefined;
  }) => {
    const missingName = !sdkName || sdkName === "unknown";
    const missingVersion = !sdkVersion || sdkVersion === "unknown";

    if (missingName && missingVersion) return "missing_name_and_version";
    if (missingName) return "missing_name";
    if (missingVersion) return "missing_version";
    return "attributed";
  },
}));

vi.mock("@langfuse/shared/src/server", async () => {
  const { ROOT_CONTEXT } = await import("@opentelemetry/api");

  return {
    ...sharedServerMock,
    getTraceById: vi.fn(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    redis: {
      status: "end",
      disconnect: vi.fn(),
    },
    ClickHouseClientManager: {
      getInstance: () => ({
        closeAllConnections: vi.fn(),
      }),
    },
    addUserToSpan: vi.fn(),
    contextWithLangfuseProps: () => ROOT_CONTEXT,
    ClickHouseResourceError: class ClickHouseResourceError extends Error {
      static ERROR_ADVICE_MESSAGE = "ClickHouse resource limit exceeded.";
      errorType = "unknown";
      tags = {};
    },
  };
});

const mockedQueryClickhouse = vi.mocked(queryClickhouse);

const projectId = "project-v4-transition";
const orgId = "org-v4-transition";
const secondProjectId = "project-v4-transition-second";
const outsideProjectId = "project-v4-transition-outside";

// Mocked Prisma delegates only implement the methods a test exercises, so
// accept any subset of PrismaClient keys with loosely typed values.
type MockPrismaClient = Partial<Record<keyof PrismaClient, unknown>>;

const createCaller = (
  prisma?: MockPrismaClient,
  callerSession: Session = session,
) =>
  v4TransitionRouter.createCaller({
    ...createInnerTRPCContext({ session: callerSession, headers: {} }),
    ...(prisma ? { prisma: prisma as unknown as PrismaClient } : {}),
  });

type SessionUser = NonNullable<Session["user"]>;
type OrganizationRole = SessionUser["organizations"][number]["role"];
type ProjectRole =
  SessionUser["organizations"][number]["projects"][number]["role"];

const createSessionWithOrgRole = (role: OrganizationRole): Session => ({
  ...session,
  user: {
    ...session.user!,
    organizations: session.user!.organizations.map((organization) => ({
      ...organization,
      role,
      projects:
        role === "NONE"
          ? organization.projects.filter((project) => project.id === projectId)
          : organization.projects,
    })),
  },
});

const createSessionWithProjectRole = (role: ProjectRole): Session => ({
  ...session,
  user: {
    ...session.user!,
    organizations: session.user!.organizations.map((organization) => ({
      ...organization,
      projects: organization.projects.map((project) => ({
        ...project,
        role,
      })),
    })),
  },
});

const session: Session = {
  expires: "1",
  user: {
    id: "user-v4-transition",
    name: "V4 Transition User",
    email: "v4-transition@example.com",
    canCreateOrganizations: true,
    organizations: [
      {
        id: orgId,
        name: "V4 Transition Org",
        role: "OWNER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        aiFeaturesEnabled: true,
        aiTelemetryEnabled: true,
        projects: [
          {
            id: projectId,
            name: "V4 Transition Project",
            role: "ADMIN",
            deletedAt: null,
            retentionDays: null,
            hasTraces: false,
            metadata: {},
            createdAt: new Date(0).toISOString(),
          },
          {
            id: secondProjectId,
            name: "Second Project",
            role: "ADMIN",
            deletedAt: null,
            retentionDays: null,
            hasTraces: false,
            metadata: {},
            createdAt: new Date(0).toISOString(),
          },
        ],
      },
    ],
    featureFlags: {
      excludeClickhouseRead: false,
      observationEvals: false,
      templateFlag: false,
      searchBar: false,
      v4BetaToggleVisible: false,
      experimentsV4Enabled: false,
    },
    admin: false,
  },
  environment: {
    enableExperimentalFeatures: false,
    selfHostedInstancePlan: "cloud:hobby",
  },
};

const accessibleProjectsFindManyArgs = {
  where: {
    orgId,
    deletedAt: null,
    id: { in: [projectId, secondProjectId] },
  },
  select: {
    id: true,
    name: true,
  },
  orderBy: {
    createdAt: "desc" as const,
  },
};

describe("v4TransitionRouter", () => {
  beforeEach(() => {
    mockedQueryClickhouse.mockResolvedValue([
      {
        projectId,
        entrypoint: "publicapi: GET /api/public/traces/{id}",
        count: "0.6666666666666666",
        lastSeen: "2026-06-24T12:34:56.789123Z",
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("summarizes legacy public API usage for a project with route classification", async () => {
    const caller = createCaller();

    const rows = await caller.legacyApiUsageSummary({
      projectId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
    });

    expect(rows).toEqual([
      {
        projectId,
        entrypoint: "publicapi: GET /api/public/traces/{id}",
        count: 0.6666666666666666,
        lastSeen: "2026-06-24T12:34:56.789123Z",
      },
    ]);

    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(1);
    const clickhouseQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(clickhouseQuery?.query).toContain(
      "FROM clusterAllReplicas('test-cluster', 'system.query_log')",
    );
    expect(clickhouseQuery?.query).not.toContain("toStartOfInterval");
    expect(clickhouseQuery?.query).not.toContain("bucket_time");
    expect(clickhouseQuery?.query).toContain(
      "splitByChar('?', JSONExtractString(log_comment, 'route'))[1]",
    );
    expect(clickhouseQuery?.query).toContain(
      "sum(1.0 / clickhouse_queries_per_api_call) AS count",
    );
    expect(clickhouseQuery?.query).toContain(
      "formatDateTime(max(event_time_microseconds), '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC') AS lastSeen",
    );
    expect(clickhouseQuery?.query).toContain(
      "SETTINGS skip_unavailable_shards = 1",
    );
    expect(clickhouseQuery?.query).toContain("AND type = 'QueryFinish'");
    expect(clickhouseQuery?.query).toContain(
      "JSONExtractString(log_comment, 'tag_schema_version') = '1'",
    );
    expect(clickhouseQuery?.query).toContain(
      "JSONExtractString(log_comment, 'surface') = 'publicapi'",
    );
    expect(clickhouseQuery?.query).toContain(
      "JSONExtractString(log_comment, 'projectId') IN {projectIds: Array(String)}",
    );
    expect(clickhouseQuery?.query).toContain(
      "GROUP BY project_id, legacy_route",
    );
    expect(clickhouseQuery?.params).toMatchObject({
      projectIds: [projectId],
    });
    expect(clickhouseQuery?.tags).toEqual({
      route: "v4-legacy-api-usage-summary",
    });
    expect(clickhouseQuery?.clickhouseSettings).toEqual({
      skip_unavailable_shards: 1,
    });

    [
      "GET /api/public/spans",
      "GET /api/public/generations",
      "GET /api/public/traces",
      "GET /api/public/sessions",
      "GET /api/public/observations",
      "GET /api/public/scores",
      "GET /api/public/v2/scores",
      "GET /api/public/metrics",
      "GET /api/public/metrics/daily",
      "GET /api/public/dataset-run-items",
    ].forEach((route) => expect(clickhouseQuery?.query).toContain(route));

    [
      "GET /api/public/traces/{id}",
      "GET /api/public/sessions/{id}",
      "GET /api/public/observations/{id}",
      "GET /api/public/scores/{id}",
      "GET /api/public/v2/scores/{id}",
      "GET /api/public/datasets/{datasetName}/runs/{runName}",
    ].forEach((route) => expect(clickhouseQuery?.query).toContain(route));
    expect(clickhouseQuery?.query).toContain(
      "match(route_path, '^GET /api/public/datasets/[^/?#]+/runs/[^/?#]+$'), 1",
    );

    expect(clickhouseQuery?.query).toContain(
      "'GET /api/public/traces',\n        'GET /api/public/observations',\n        'GET /api/public/scores',\n        'GET /api/public/v2/scores',\n        'GET /api/public/metrics/daily',\n        'GET /api/public/dataset-run-items'\n      ), 2",
    );
    expect(clickhouseQuery?.query).toContain(
      "'GET /api/public/sessions',\n        'GET /api/public/metrics'\n      ), 1",
    );
    expect(clickhouseQuery?.query).toContain(
      "match(route_path, '^GET /api/public/traces/[^/?#]+$'), 3",
    );
  });

  it("rejects ranges over 30 days", async () => {
    const caller = createCaller();

    await expect(
      caller.legacyApiUsageSummary({
        projectId,
        fromTimestamp: new Date("2026-05-25T00:00:00Z"),
        toTimestamp: new Date("2026-06-25T00:00:00Z"),
      }),
    ).rejects.toThrow("30 days");

    expect(mockedQueryClickhouse).not.toHaveBeenCalled();
  });

  it("queries SDK usage for only the authorized project", async () => {
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        {
          projectId,
          sdkName: "python",
          sdkVersion: "4.7.0",
          publicKey: "pk-lf-python",
          count: "2",
          eventsCount: "2",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T02:00:00Z",
          hasDelayedOtelEvents: "1",
        },
      ])
      .mockResolvedValueOnce([]);
    const caller = createCaller();

    const summary = await caller.sdkUsageSummary({
      projectId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
    });

    expect(summary).toMatchObject({
      projectId,
      sdkUsageSeries: [
        {
          sdkName: "python",
          sdkVersion: "4.7.0",
          count: 2,
          eventsCount: 2,
          v4MigrationStatus: "compatible",
        },
      ],
    });
    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(2);
    expect(mockedQueryClickhouse.mock.calls[0]?.[0].params).toMatchObject({
      projectIds: [projectId],
    });
    expect(mockedQueryClickhouse.mock.calls[1]?.[0].params).toMatchObject({
      projectIds: [projectId],
    });
  });

  it("rejects project summaries outside the caller session", async () => {
    const caller = createCaller();
    const range = {
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
    };

    await expect(
      caller.sdkUsageSummary({ projectId: outsideProjectId, ...range }),
    ).rejects.toThrow("User is not a member of this project");
    await expect(
      caller.legacyApiUsageSummary({
        projectId: outsideProjectId,
        ...range,
      }),
    ).rejects.toThrow("User is not a member of this project");
    expect(mockedQueryClickhouse).not.toHaveBeenCalled();
  });

  it("summarizes legacy integrations", async () => {
    const mockPrisma = {
      posthogIntegration: {
        findMany: vi.fn().mockResolvedValue([
          {
            projectId,
            enabled: true,
            exportSource: "TRACES_OBSERVATIONS",
          },
        ]),
      },
      mixpanelIntegration: {
        findMany: vi.fn().mockResolvedValue([
          {
            projectId,
            enabled: true,
            exportSource: "EVENTS",
          },
        ]),
      },
      blobStorageIntegration: {
        findMany: vi.fn().mockResolvedValue([
          {
            projectId,
            enabled: true,
            exportSource: "TRACES_OBSERVATIONS_EVENTS",
          },
        ]),
      },
    };
    const caller = createCaller(mockPrisma);

    await expect(caller.summary({ projectId })).resolves.toEqual({
      projectId,
      legacyIntegrationCount: 2,
      legacyIntegrations: {
        posthog: true,
        mixpanel: false,
        blobStorage: true,
      },
    });

    expect(mockPrisma.posthogIntegration.findMany).toHaveBeenCalledWith({
      where: { projectId: { in: [projectId] } },
      select: { projectId: true, enabled: true, exportSource: true },
    });
    expect(mockPrisma.mixpanelIntegration.findMany).toHaveBeenCalledWith({
      where: { projectId: { in: [projectId] } },
      select: { projectId: true, enabled: true, exportSource: true },
    });
    expect(mockPrisma.blobStorageIntegration.findMany).toHaveBeenCalledWith({
      where: { projectId: { in: [projectId] } },
      select: { projectId: true, enabled: true, exportSource: true },
    });
  });

  it("summarizes trace-level evals", async () => {
    const mockPrisma = {
      jobConfiguration: {
        groupBy: vi.fn().mockResolvedValue([
          {
            projectId,
            _count: { _all: 3 },
          },
        ]),
      },
    };
    const caller = createCaller(mockPrisma);

    await expect(caller.traceLevelEvalSummary({ projectId })).resolves.toEqual({
      projectId,
      traceLevelEvalCount: 3,
    });

    expect(mockPrisma.jobConfiguration.groupBy).toHaveBeenCalledWith({
      by: ["projectId"],
      where: {
        projectId: { in: [projectId] },
        jobType: "EVAL",
        targetObject: { in: ["trace", "dataset"] },
        status: "ACTIVE",
        timeScope: { has: "NEW" },
      },
      _count: { _all: true },
    });
  });

  it("returns zero evals when no active configs exist", async () => {
    const mockPrisma = {
      jobConfiguration: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
    };
    const caller = createCaller(mockPrisma);

    await expect(caller.traceLevelEvalSummary({ projectId })).resolves.toEqual({
      projectId,
      traceLevelEvalCount: 0,
    });
  });

  it("does not count disabled legacy integrations", async () => {
    const mockPrisma = {
      posthogIntegration: {
        findMany: vi.fn().mockResolvedValue([
          {
            projectId,
            enabled: false,
            exportSource: "TRACES_OBSERVATIONS",
          },
        ]),
      },
      mixpanelIntegration: {
        findMany: vi.fn().mockResolvedValue([
          {
            projectId,
            enabled: true,
            exportSource: "TRACES_OBSERVATIONS_EVENTS",
          },
        ]),
      },
      blobStorageIntegration: {
        findMany: vi.fn().mockResolvedValue([
          {
            projectId,
            enabled: false,
            exportSource: "TRACES_OBSERVATIONS_EVENTS",
          },
        ]),
      },
    };
    const caller = createCaller(mockPrisma);

    await expect(caller.summary({ projectId })).resolves.toEqual({
      projectId,
      legacyIntegrationCount: 1,
      legacyIntegrations: {
        posthog: false,
        mixpanel: true,
        blobStorage: false,
      },
    });
  });

  it("summarizes legacy integrations by active organization project", async () => {
    const mockPrisma = {
      project: {
        findMany: vi.fn().mockResolvedValue([
          { id: projectId, name: "V4 Transition Project" },
          { id: secondProjectId, name: "Second Project" },
        ]),
      },
      posthogIntegration: {
        findMany: vi.fn().mockResolvedValue([
          {
            projectId,
            enabled: true,
            exportSource: "TRACES_OBSERVATIONS",
          },
        ]),
      },
      mixpanelIntegration: {
        findMany: vi.fn().mockResolvedValue([
          {
            projectId: secondProjectId,
            enabled: true,
            exportSource: "TRACES_OBSERVATIONS_EVENTS",
          },
        ]),
      },
      blobStorageIntegration: {
        findMany: vi.fn().mockResolvedValue([
          {
            projectId,
            enabled: true,
            exportSource: "EVENTS",
          },
          {
            projectId: secondProjectId,
            enabled: false,
            exportSource: "TRACES_OBSERVATIONS",
          },
        ]),
      },
    };
    const caller = createCaller(mockPrisma);

    await expect(caller.summaryByProject({ orgId })).resolves.toEqual({
      projects: [
        {
          projectId,
          projectName: "V4 Transition Project",
          legacyIntegrationCount: 1,
          legacyIntegrations: {
            posthog: true,
            mixpanel: false,
            blobStorage: false,
          },
          forceV3Experience: false,
        },
        {
          projectId: secondProjectId,
          projectName: "Second Project",
          legacyIntegrationCount: 1,
          legacyIntegrations: {
            posthog: false,
            mixpanel: true,
            blobStorage: false,
          },
          forceV3Experience: false,
        },
      ],
    });

    expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
      accessibleProjectsFindManyArgs,
    );
  });

  it("summarizes trace-level evals by active organization project", async () => {
    const mockPrisma = {
      project: {
        findMany: vi.fn().mockResolvedValue([
          { id: projectId, name: "V4 Transition Project" },
          { id: secondProjectId, name: "Second Project" },
        ]),
      },
      jobConfiguration: {
        groupBy: vi.fn().mockResolvedValue([
          {
            projectId,
            _count: { _all: 3 },
          },
        ]),
      },
    };
    const caller = createCaller(mockPrisma);

    await expect(
      caller.traceLevelEvalSummaryByProject({ orgId }),
    ).resolves.toEqual([
      {
        projectId,
        traceLevelEvalCount: 3,
      },
      {
        projectId: secondProjectId,
        traceLevelEvalCount: 0,
      },
    ]);

    expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
      accessibleProjectsFindManyArgs,
    );
    expect(mockPrisma.jobConfiguration.groupBy).toHaveBeenCalledWith({
      by: ["projectId"],
      where: {
        projectId: { in: [projectId, secondProjectId] },
        jobType: "EVAL",
        targetObject: { in: ["trace", "dataset"] },
        status: "ACTIVE",
        timeScope: { has: "NEW" },
      },
      _count: { _all: true },
    });
  });

  it("allows organization admins and owners to access org-level v4 data", async () => {
    const mockPrisma = {
      project: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    await expect(
      createCaller(
        mockPrisma,
        createSessionWithOrgRole("OWNER"),
      ).summaryByProject({
        orgId,
      }),
    ).resolves.toEqual({ projects: [] });
    await expect(
      createCaller(
        mockPrisma,
        createSessionWithOrgRole("OWNER"),
      ).traceLevelEvalSummaryByProject({
        orgId,
      }),
    ).resolves.toEqual([]);
    await expect(
      createCaller(
        mockPrisma,
        createSessionWithOrgRole("OWNER"),
      ).sdkUsageSummaryByProject({
        orgId,
        fromTimestamp: new Date("2026-06-24T00:00:00Z"),
        toTimestamp: new Date("2026-06-25T00:00:00Z"),
      }),
    ).resolves.toEqual([]);

    await expect(
      createCaller(
        mockPrisma,
        createSessionWithOrgRole("ADMIN"),
      ).summaryByProject({
        orgId,
      }),
    ).resolves.toEqual({ projects: [] });
    await expect(
      createCaller(
        mockPrisma,
        createSessionWithOrgRole("ADMIN"),
      ).traceLevelEvalSummaryByProject({
        orgId,
      }),
    ).resolves.toEqual([]);
    await expect(
      createCaller(
        mockPrisma,
        createSessionWithOrgRole("ADMIN"),
      ).sdkUsageSummaryByProject({
        orgId,
        fromTimestamp: new Date("2026-06-24T00:00:00Z"),
        toTimestamp: new Date("2026-06-25T00:00:00Z"),
      }),
    ).resolves.toEqual([]);
  });

  it("allows project-only members to access org-level v4 data for their readable projects", async () => {
    const findManyProjects = vi.fn().mockResolvedValue([
      {
        id: projectId,
        name: "V4 Transition Project",
      },
    ]);
    const caller = createCaller(
      {
        project: {
          findMany: findManyProjects,
        },
        posthogIntegration: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        mixpanelIntegration: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        blobStorageIntegration: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      createSessionWithOrgRole("NONE"),
    );

    await expect(caller.summaryByProject({ orgId })).resolves.toEqual({
      projects: [
        {
          projectId,
          projectName: "V4 Transition Project",
          legacyIntegrationCount: 0,
          legacyIntegrations: {
            posthog: false,
            mixpanel: false,
            blobStorage: false,
          },
          forceV3Experience: false,
        },
      ],
    });
    expect(findManyProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId,
          deletedAt: null,
          id: { in: [projectId] },
        },
      }),
    );
  });

  it.each(["MEMBER", "VIEWER"] as const)(
    "allows project %s roles to access project-level v4 data",
    async (role) => {
      const mockPrisma = {
        posthogIntegration: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        mixpanelIntegration: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        blobStorageIntegration: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const caller = createCaller(
        mockPrisma,
        createSessionWithProjectRole(role),
      );

      await expect(caller.summary({ projectId })).resolves.toEqual({
        projectId,
        legacyIntegrationCount: 0,
        legacyIntegrations: {
          posthog: false,
          mixpanel: false,
          blobStorage: false,
        },
      });
    },
  );

  it("summarizes outdated SDK usage series by organization project", async () => {
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        {
          projectId,
          sdkName: "python",
          sdkVersion: "3.9.0",
          publicKey: "pk-lf-python",
          count: "8",
          eventsCount: "8",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T02:00:00Z",
          hasDelayedOtelEvents: "1",
        },
        {
          projectId,
          sdkName: "python",
          sdkVersion: "4.14.1",
          publicKey: "pk-lf-python",
          count: "13",
          eventsCount: "13",
          firstSeen: "2026-06-24T03:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
          hasDelayedOtelEvents: "1",
        },
        {
          projectId,
          sdkName: "python",
          sdkVersion: "4.6.9",
          publicKey: "pk-lf-pre-v4-python",
          count: "5",
          eventsCount: "0",
          firstSeen: "2026-06-24T12:00:00Z",
          lastSeen: "2026-06-24T13:00:00Z",
          hasDelayedOtelEvents: "1",
        },
        {
          projectId,
          sdkName: "python",
          sdkVersion: "4.7.0",
          publicKey: "pk-lf-current-python",
          count: "6",
          eventsCount: "6",
          firstSeen: "2026-06-24T13:30:00Z",
          lastSeen: "2026-06-24T14:00:00Z",
          hasDelayedOtelEvents: "1",
        },
        {
          projectId: secondProjectId,
          sdkName: "@langfuse/tracing",
          sdkVersion: "5.3.9",
          publicKey: "pk-lf-old-js",
          count: "5",
          eventsCount: "5",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
          hasDelayedOtelEvents: "1",
        },
        {
          projectId: secondProjectId,
          sdkName: "unknown",
          sdkVersion: "unknown",
          publicKey: "pk-lf-otel",
          count: "3",
          eventsCount: "3",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
          hasDelayedOtelEvents: "0",
        },
        {
          projectId: secondProjectId,
          sdkName: "custom-otel-writer",
          sdkVersion: "1.2.3",
          publicKey: "pk-lf-custom-otel",
          count: "2",
          eventsCount: "2",
          firstSeen: "2026-06-24T02:00:00Z",
          lastSeen: "2026-06-24T03:00:00Z",
          hasDelayedOtelEvents: "1",
        },
      ])
      .mockResolvedValueOnce([{ projectId, count: "1" }]);
    const mockPrisma = {
      project: {
        findMany: vi.fn().mockResolvedValue([
          { id: projectId, name: "V4 Transition Project" },
          { id: secondProjectId, name: "Second Project" },
        ]),
      },
    };
    const caller = createCaller(mockPrisma);

    const rows = await caller.sdkUsageSummaryByProject({
      orgId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
    });

    expect(rows).toEqual([
      {
        projectId,
        experimentInstrumentationMigration: {
          status: "sdk_usage_inconclusive",
          upgradePath: "sdk",
        },
        sdkUsageSeries: [
          {
            sdkName: "python",
            sdkVersion: "3.9.0",
            canonicalSdkName: "python",
            publicKey: "pk-lf-python",
            count: 8,
            eventsCount: 8,
            firstSeen: "2026-06-24T01:00:00Z",
            lastSeen: "2026-06-24T02:00:00Z",
            hasDelayedOtelEvents: true,
            attributionStatus: "attributed",
            v4MigrationStatus: "upgrade_required",
          },
          {
            sdkName: "python",
            sdkVersion: "4.14.1",
            canonicalSdkName: "python",
            publicKey: "pk-lf-python",
            count: 13,
            eventsCount: 13,
            firstSeen: "2026-06-24T03:00:00Z",
            lastSeen: "2026-06-24T04:00:00Z",
            hasDelayedOtelEvents: true,
            attributionStatus: "attributed",
            v4MigrationStatus: "compatible",
          },
          {
            sdkName: "python",
            sdkVersion: "4.6.9",
            canonicalSdkName: "python",
            publicKey: "pk-lf-pre-v4-python",
            count: 5,
            eventsCount: 0,
            firstSeen: "2026-06-24T12:00:00Z",
            lastSeen: "2026-06-24T13:00:00Z",
            hasDelayedOtelEvents: true,
            attributionStatus: "attributed",
            v4MigrationStatus: "upgrade_required",
          },
          {
            sdkName: "python",
            sdkVersion: "4.7.0",
            canonicalSdkName: "python",
            publicKey: "pk-lf-current-python",
            count: 6,
            eventsCount: 6,
            firstSeen: "2026-06-24T13:30:00Z",
            lastSeen: "2026-06-24T14:00:00Z",
            hasDelayedOtelEvents: true,
            attributionStatus: "attributed",
            v4MigrationStatus: "compatible",
          },
        ],
      },
      {
        projectId: secondProjectId,
        experimentInstrumentationMigration: {
          status: "not_required",
          upgradePath: null,
        },
        sdkUsageSeries: [
          {
            sdkName: "@langfuse/tracing",
            sdkVersion: "5.3.9",
            canonicalSdkName: "javascript",
            publicKey: "pk-lf-old-js",
            count: 5,
            eventsCount: 5,
            firstSeen: "2026-06-24T01:00:00Z",
            lastSeen: "2026-06-24T04:00:00Z",
            hasDelayedOtelEvents: true,
            attributionStatus: "attributed",
            v4MigrationStatus: "upgrade_required",
          },
          {
            sdkName: "unknown",
            sdkVersion: "unknown",
            canonicalSdkName: null,
            publicKey: "pk-lf-otel",
            count: 3,
            eventsCount: 3,
            firstSeen: "2026-06-24T01:00:00Z",
            lastSeen: "2026-06-24T04:00:00Z",
            hasDelayedOtelEvents: false,
            attributionStatus: "missing_name_and_version",
            v4MigrationStatus: "unknown",
          },
          {
            sdkName: "custom-otel-writer",
            sdkVersion: "1.2.3",
            canonicalSdkName: null,
            publicKey: "pk-lf-custom-otel",
            count: 2,
            eventsCount: 2,
            firstSeen: "2026-06-24T02:00:00Z",
            lastSeen: "2026-06-24T03:00:00Z",
            hasDelayedOtelEvents: true,
            attributionStatus: "attributed",
            v4MigrationStatus: "unknown",
          },
        ],
      },
    ]);

    expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
      accessibleProjectsFindManyArgs,
    );
    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(2);
    const usageQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(usageQuery?.query).toContain("FROM events_core");
    expect(usageQuery?.query).not.toContain("WITH selected");
    expect(usageQuery?.query).not.toContain("FROM selected");
    expect(usageQuery?.query).not.toContain("UNION ALL");
    expect(usageQuery?.query).not.toContain("FROM scores");
    expect(usageQuery?.query).toContain(
      "source IN {legacyDualWriteSources: Array(String)}",
    );
    expect(usageQuery?.query).not.toContain("system.columns");
    expect(
      usageQuery?.query.match(/project_id IN \{projectIds: Array\(String\)\}/g),
    ).toHaveLength(1);
    expect(usageQuery?.query).toContain(
      "GROUP BY\n  project_id,\n  if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name),",
    );
    expect(usageQuery?.query).toContain(
      "if(countIf(source = 'otel-dual-write') > 0, true, NULL) AS hasDelayedOtelEvents",
    );
    expect(usageQuery?.query).not.toContain("source = 'otel' OR");
    expect(usageQuery?.query).toContain(
      "formatDateTime(min(start_time), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS firstSeen",
    );
    expect(usageQuery?.query).toContain(
      "formatDateTime(max(start_time), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS lastSeen",
    );
    expect(usageQuery?.query).toContain(
      "ingestion_sdk_name NOT IN {internalSdkNames: Array(String)}",
    );
    expect(usageQuery?.query).toContain(
      "AND NOT startsWith(environment, 'langfuse-')",
    );
    expect(usageQuery?.query).not.toContain("toDate(start_time)");
    expect(usageQuery?.query).not.toContain("toDate(timestamp)");
    expect(usageQuery?.params).toMatchObject({
      projectIds: [projectId, secondProjectId],
      fromTimestamp: "2026-06-24 00:00:00.000",
      toTimestamp: "2026-06-25 00:00:00.000",
      legacyDualWriteSources: ["ingestion-api-dual-write", "otel-dual-write"],
    });
    expect(usageQuery?.tags).toEqual({
      route: "v4-sdk-usage-summary",
    });

    const experimentUsageQuery = mockedQueryClickhouse.mock.calls[1]?.[0];
    expect(experimentUsageQuery?.query).toContain(
      "splitByChar('?', JSONExtractString(log_comment, 'route'))[1] = 'POST /api/public/dataset-run-items'",
    );
    expect(experimentUsageQuery?.query).toContain(
      "JSONExtractString(log_comment, 'projectId') IN {projectIds: Array(String)}",
    );
    expect(experimentUsageQuery?.query).toContain(
      "event_date >= toDate({fromTimestamp: DateTime64(3)})",
    );
    expect(experimentUsageQuery?.params).toMatchObject({
      projectIds: [projectId, secondProjectId],
      fromTimestamp: "2026-06-24 00:00:00.000",
      toTimestamp: "2026-06-25 00:00:00.000",
    });
    expect(experimentUsageQuery?.tags).toEqual({
      route: "v4-experiment-instrumentation-summary",
    });
  });

  it("summarizes SDK usage for a single project with exactly that projectId", async () => {
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        {
          projectId,
          sdkName: "python",
          sdkVersion: "4.7.0",
          publicKey: "pk-lf-python",
          count: "6",
          eventsCount: "6",
          firstSeen: "2026-06-24T13:30:00Z",
          lastSeen: "2026-06-24T14:00:00Z",
          hasDelayedOtelEvents: "1",
        },
      ])
      .mockResolvedValueOnce([]);

    const caller = createCaller();

    const summary = await caller.sdkUsageSummary({
      projectId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
    });

    expect(summary).toMatchObject({
      projectId,
      experimentInstrumentationMigration: {
        status: "not_required",
        upgradePath: null,
      },
      sdkUsageSeries: [
        {
          sdkName: "python",
          sdkVersion: "4.7.0",
          v4MigrationStatus: "compatible",
        },
      ],
    });

    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(2);
    expect(mockedQueryClickhouse.mock.calls[0]?.[0]?.params).toMatchObject({
      projectIds: [projectId],
    });
    expect(mockedQueryClickhouse.mock.calls[1]?.[0]?.params).toMatchObject({
      projectIds: [projectId],
    });
    expect(mockedQueryClickhouse.mock.calls[0]?.[0]?.tags).toEqual({
      route: "v4-sdk-usage-summary",
    });
    expect(mockedQueryClickhouse.mock.calls[1]?.[0]?.tags).toEqual({
      route: "v4-experiment-instrumentation-summary",
    });
  });

  it("requires removing dataset-run-items POST usage for native OTel instrumentation", async () => {
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        {
          projectId,
          sdkName: "unknown",
          sdkVersion: "unknown",
          publicKey: "pk-lf-otel",
          count: "3",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
          hasDelayedOtelEvents: "0",
        },
      ])
      .mockResolvedValueOnce([{ projectId, count: "1" }]);
    const caller = createCaller({
      project: {
        findMany: vi.fn().mockResolvedValue([{ id: projectId }]),
      },
    });

    const [summary] = await caller.sdkUsageSummaryByProject({
      orgId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
    });

    expect(summary).toMatchObject({
      projectId,
      experimentInstrumentationMigration: {
        status: "required",
        upgradePath: "api",
      },
    });
  });

  it("preserves SDK usage when the experiment instrumentation check fails", async () => {
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        {
          projectId,
          sdkName: "python",
          sdkVersion: "3.9.0",
          publicKey: "pk-lf-python",
          count: "3",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
          hasDelayedOtelEvents: "1",
        },
      ])
      .mockRejectedValueOnce(new Error("query_log unavailable"));
    const caller = createCaller({
      project: {
        findMany: vi.fn().mockResolvedValue([{ id: projectId }]),
      },
    });

    const [summary] = await caller.sdkUsageSummaryByProject({
      orgId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
    });

    expect(summary).toMatchObject({
      projectId,
      experimentInstrumentationMigration: {
        status: "check_failed",
        upgradePath: null,
      },
      sdkUsageSeries: [
        {
          sdkName: "python",
          sdkVersion: "3.9.0",
          v4MigrationStatus: "upgrade_required",
        },
      ],
    });
  });

  it("requires an API upgrade when POST usage predates the experiment runner", async () => {
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        {
          projectId,
          sdkName: "python",
          sdkVersion: "3.3.5",
          publicKey: "pk-lf-python",
          count: "3",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
          hasDelayedOtelEvents: "1",
        },
      ])
      .mockResolvedValueOnce([{ projectId, count: "1" }]);
    const caller = createCaller({
      project: {
        findMany: vi.fn().mockResolvedValue([{ id: projectId }]),
      },
    });

    const [summary] = await caller.sdkUsageSummaryByProject({
      orgId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
    });

    expect(summary?.experimentInstrumentationMigration).toEqual({
      status: "required",
      upgradePath: "api",
    });
  });

  it("does not require an upgrade for current experiment instrumentation", async () => {
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        {
          projectId,
          sdkName: "python",
          sdkVersion: "4.0.0",
          publicKey: "pk-lf-python",
          count: "3",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
          hasDelayedOtelEvents: "1",
        },
      ])
      .mockResolvedValueOnce([{ projectId, count: "1" }]);
    const caller = createCaller({
      project: {
        findMany: vi.fn().mockResolvedValue([{ id: projectId }]),
      },
    });

    const [summary] = await caller.sdkUsageSummaryByProject({
      orgId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
    });

    expect(summary?.experimentInstrumentationMigration).toEqual({
      status: "not_required",
      upgradePath: null,
    });
  });

  it("summarizes legacy public API usage by organization project", async () => {
    mockedQueryClickhouse.mockResolvedValue([
      {
        projectId,
        entrypoint: "publicapi: GET /api/public/traces/{id}",
        count: "0.6666666666666666",
        lastSeen: "2026-06-24T12:34:56.789123Z",
      },
      {
        projectId: secondProjectId,
        entrypoint: "publicapi: GET /api/public/metrics",
        count: 3,
        lastSeen: "2026-06-24T15:00:00.000000Z",
      },
    ]);
    const mockPrisma = {
      project: {
        findMany: vi.fn().mockResolvedValue([
          { id: projectId, name: "V4 Transition Project" },
          { id: secondProjectId, name: "Second Project" },
        ]),
      },
    };
    const caller = createCaller(mockPrisma);

    const rows = await caller.legacyApiUsageSummaryByProject({
      orgId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
    });

    expect(rows).toEqual([
      {
        projectId,
        entrypoint: "publicapi: GET /api/public/traces/{id}",
        count: 0.6666666666666666,
        lastSeen: "2026-06-24T12:34:56.789123Z",
      },
      {
        projectId: secondProjectId,
        entrypoint: "publicapi: GET /api/public/metrics",
        count: 3,
        lastSeen: "2026-06-24T15:00:00.000000Z",
      },
    ]);

    expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
      accessibleProjectsFindManyArgs,
    );
    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(1);
    const clickhouseQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(clickhouseQuery?.query).not.toContain("toStartOfInterval");
    expect(clickhouseQuery?.query).not.toContain("bucket_time");
    expect(clickhouseQuery?.query).toContain(
      "JSONExtractString(log_comment, 'projectId') AS project_id",
    );
    expect(clickhouseQuery?.query).toContain(
      "JSONExtractString(log_comment, 'projectId') IN {projectIds: Array(String)}",
    );
    expect(clickhouseQuery?.query).toContain("project_id AS projectId");
    expect(clickhouseQuery?.query).toContain(
      "formatDateTime(max(event_time_microseconds), '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC') AS lastSeen",
    );
    expect(clickhouseQuery?.query).toContain(
      "GROUP BY project_id, legacy_route",
    );
    expect(clickhouseQuery?.params).toMatchObject({
      projectIds: [projectId, secondProjectId],
    });
    expect(clickhouseQuery?.tags).toEqual({
      route: "v4-legacy-api-usage-summary",
    });
  });
});
