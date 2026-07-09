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

const createCaller = (
  prisma?: Partial<PrismaClient>,
  callerSession: Session = session,
) =>
  v4TransitionRouter.createCaller({
    ...createInnerTRPCContext({ session: callerSession, headers: {} }),
    ...(prisma ? { prisma: prisma as PrismaClient } : {}),
  });

type OrganizationRole = Session["user"]["organizations"][number]["role"];
type ProjectRole =
  Session["user"]["organizations"][number]["projects"][number]["role"];

const createSessionWithOrgRole = (role: OrganizationRole): Session => ({
  ...session,
  user: {
    ...session.user,
    organizations: session.user.organizations.map((organization) => ({
      ...organization,
      role,
    })),
  },
});

const createSessionWithProjectRole = (role: ProjectRole): Session => ({
  ...session,
  user: {
    ...session.user,
    organizations: session.user.organizations.map((organization) => ({
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

describe("v4TransitionRouter", () => {
  beforeEach(() => {
    mockedQueryClickhouse.mockResolvedValue([
      {
        time: "2026-06-24T12:00:00Z",
        entrypoint: "publicapi: GET /api/public/traces/{id}",
        count: "0.6666666666666666",
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("queries legacy public API usage with UTC buckets and route classification", async () => {
    const caller = createCaller();

    const rows = await caller.timeSeriesByEntrypoint({
      projectId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
      granularity: "auto",
    });

    expect(rows).toHaveLength(25);
    expect(new Set(rows.map((row) => row.time)).size).toBe(24);
    expect(rows[0]).toEqual({
      time: "2026-06-24T00:00:00Z",
      entrypoint: "",
      count: 0,
    });
    expect(rows[12]).toEqual({
      time: "2026-06-24T12:00:00Z",
      entrypoint: "",
      count: 0,
    });
    expect(rows[13]).toEqual({
      time: "2026-06-24T12:00:00Z",
      entrypoint: "publicapi: GET /api/public/traces/{id}",
      count: 0.6666666666666666,
    });
    expect(rows[24]).toEqual({
      time: "2026-06-24T23:00:00Z",
      entrypoint: "",
      count: 0,
    });

    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(1);
    const clickhouseQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(clickhouseQuery?.query).toContain(
      "FROM clusterAllReplicas('test-cluster', 'system.query_log')",
    );
    expect(clickhouseQuery?.query).toContain(
      "toStartOfInterval(event_time_microseconds, INTERVAL 1 HOUR, 'UTC') AS bucket_time",
    );
    expect(clickhouseQuery?.query).toContain(
      "splitByChar('?', JSONExtractString(log_comment, 'route'))[1]",
    );
    expect(clickhouseQuery?.query).toContain(
      "sum(1.0 / clickhouse_queries_per_api_call) AS count",
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
      "JSONExtractString(log_comment, 'projectId') = {projectId: String}",
    );
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
    ].forEach((route) => expect(clickhouseQuery?.query).toContain(route));

    [
      "GET /api/public/traces/{id}",
      "GET /api/public/sessions/{id}",
      "GET /api/public/observations/{id}",
      "GET /api/public/scores/{id}",
      "GET /api/public/v2/scores/{id}",
    ].forEach((route) => expect(clickhouseQuery?.query).toContain(route));

    expect(clickhouseQuery?.query).toContain(
      "'GET /api/public/traces',\n        'GET /api/public/observations',\n        'GET /api/public/scores',\n        'GET /api/public/v2/scores',\n        'GET /api/public/metrics/daily'\n      ), 2",
    );
    expect(clickhouseQuery?.query).toContain(
      "'GET /api/public/sessions',\n        'GET /api/public/metrics'\n      ), 1",
    );
    expect(clickhouseQuery?.query).toContain(
      "match(route_path, '^GET /api/public/traces/[^/?#]+$'), 3",
    );
  });

  it("fills daily buckets for a 30 day timeline", async () => {
    mockedQueryClickhouse.mockResolvedValueOnce([
      {
        time: "2026-06-10T00:00:00Z",
        entrypoint: "publicapi: GET /api/public/traces",
        count: "42",
      },
    ]);

    const caller = v4TransitionRouter.createCaller(
      createInnerTRPCContext({ session, headers: {} }),
    );

    const rows = await caller.timeSeriesByEntrypoint({
      projectId,
      fromTimestamp: new Date("2026-05-26T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
      granularity: "auto",
    });

    expect(rows).toHaveLength(31);
    expect(new Set(rows.map((row) => row.time)).size).toBe(30);
    expect(rows[0]).toEqual({
      time: "2026-05-26T00:00:00Z",
      entrypoint: "",
      count: 0,
    });
    expect(rows[15]).toEqual({
      time: "2026-06-10T00:00:00Z",
      entrypoint: "",
      count: 0,
    });
    expect(rows[16]).toEqual({
      time: "2026-06-10T00:00:00Z",
      entrypoint: "publicapi: GET /api/public/traces",
      count: 42,
    });
    expect(rows[30]).toEqual({
      time: "2026-06-24T00:00:00Z",
      entrypoint: "",
      count: 0,
    });

    const clickhouseQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(clickhouseQuery?.query).toContain(
      "toStartOfInterval(event_time_microseconds, INTERVAL 1 DAY, 'UTC') AS bucket_time",
    );
  });

  it("fills 2 minute buckets for a 1 hour timeline", async () => {
    mockedQueryClickhouse.mockResolvedValueOnce([
      {
        time: "2026-06-24T00:20:00Z",
        entrypoint: "publicapi: GET /api/public/traces",
        count: "8",
      },
    ]);

    const caller = createCaller();

    const rows = await caller.timeSeriesByEntrypoint({
      projectId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-24T01:00:00Z"),
      granularity: "auto",
    });

    expect(rows).toHaveLength(31);
    expect(new Set(rows.map((row) => row.time)).size).toBe(30);
    expect(rows[0]).toEqual({
      time: "2026-06-24T00:00:00Z",
      entrypoint: "",
      count: 0,
    });
    expect(rows[10]).toEqual({
      time: "2026-06-24T00:20:00Z",
      entrypoint: "",
      count: 0,
    });
    expect(rows[11]).toEqual({
      time: "2026-06-24T00:20:00Z",
      entrypoint: "publicapi: GET /api/public/traces",
      count: 8,
    });
    expect(rows[30]).toEqual({
      time: "2026-06-24T00:58:00Z",
      entrypoint: "",
      count: 0,
    });

    const clickhouseQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(clickhouseQuery?.query).toContain(
      "toStartOfInterval(event_time_microseconds, INTERVAL 2 MINUTE, 'UTC') AS bucket_time",
    );
  });

  it("fills 2 minute buckets for a 45 minute timeline", async () => {
    mockedQueryClickhouse.mockResolvedValueOnce([
      {
        time: "2026-06-24T00:16:00Z",
        entrypoint: "publicapi: GET /api/public/traces",
        count: "8",
      },
    ]);

    const caller = createCaller();

    const rows = await caller.timeSeriesByEntrypoint({
      projectId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-24T00:45:00Z"),
      granularity: "auto",
    });

    expect(rows).toHaveLength(24);
    expect(new Set(rows.map((row) => row.time)).size).toBe(23);
    expect(rows[0]).toEqual({
      time: "2026-06-24T00:00:00Z",
      entrypoint: "",
      count: 0,
    });
    expect(rows[8]).toEqual({
      time: "2026-06-24T00:16:00Z",
      entrypoint: "",
      count: 0,
    });
    expect(rows[9]).toEqual({
      time: "2026-06-24T00:16:00Z",
      entrypoint: "publicapi: GET /api/public/traces",
      count: 8,
    });
    expect(rows[23]).toEqual({
      time: "2026-06-24T00:44:00Z",
      entrypoint: "",
      count: 0,
    });

    const clickhouseQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(clickhouseQuery?.query).toContain(
      "toStartOfInterval(event_time_microseconds, INTERVAL 2 MINUTE, 'UTC') AS bucket_time",
    );
  });

  it("fills 5 minute buckets for a 3 hour timeline", async () => {
    mockedQueryClickhouse.mockResolvedValueOnce([
      {
        time: "2026-06-24T01:00:00Z",
        entrypoint: "publicapi: GET /api/public/traces",
        count: "12",
      },
    ]);

    const caller = createCaller();

    const rows = await caller.timeSeriesByEntrypoint({
      projectId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-24T03:00:00Z"),
      granularity: "auto",
    });

    expect(rows).toHaveLength(37);
    expect(new Set(rows.map((row) => row.time)).size).toBe(36);
    expect(rows[0]).toEqual({
      time: "2026-06-24T00:00:00Z",
      entrypoint: "",
      count: 0,
    });
    expect(rows[12]).toEqual({
      time: "2026-06-24T01:00:00Z",
      entrypoint: "",
      count: 0,
    });
    expect(rows[13]).toEqual({
      time: "2026-06-24T01:00:00Z",
      entrypoint: "publicapi: GET /api/public/traces",
      count: 12,
    });
    expect(rows[36]).toEqual({
      time: "2026-06-24T02:55:00Z",
      entrypoint: "",
      count: 0,
    });

    const clickhouseQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(clickhouseQuery?.query).toContain(
      "toStartOfInterval(event_time_microseconds, INTERVAL 5 MINUTE, 'UTC') AS bucket_time",
    );
  });

  it("uses hour buckets for a 7 day timeline", async () => {
    mockedQueryClickhouse.mockResolvedValueOnce([]);

    const caller = createCaller();

    const rows = await caller.timeSeriesByEntrypoint({
      projectId,
      fromTimestamp: new Date("2026-06-18T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
      granularity: "auto",
    });

    expect(rows).toEqual([]);

    const clickhouseQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(clickhouseQuery?.query).toContain(
      "toStartOfInterval(event_time_microseconds, INTERVAL 1 HOUR, 'UTC') AS bucket_time",
    );
  });

  it("rejects ranges over 30 days", async () => {
    const mockPrisma = {
      $queryRaw: vi.fn(),
    };
    const caller = createCaller(mockPrisma);

    await expect(
      caller.timeSeriesByEntrypoint({
        projectId,
        fromTimestamp: new Date("2026-05-25T00:00:00Z"),
        toTimestamp: new Date("2026-06-25T00:00:00Z"),
        granularity: "auto",
      }),
    ).rejects.toThrow("30 days");

    await expect(
      caller.traceLevelEvalExecutionsTimeSeries({
        projectId,
        fromTimestamp: new Date("2026-05-25T00:00:00Z"),
        toTimestamp: new Date("2026-06-25T00:00:00Z"),
        granularity: "auto",
      }),
    ).rejects.toThrow("30 days");

    await expect(
      caller.sdkUsageTimeSeries({
        projectId,
        fromTimestamp: new Date("2026-05-25T00:00:00Z"),
        toTimestamp: new Date("2026-06-25T00:00:00Z"),
        granularity: "auto",
      }),
    ).rejects.toThrow("30 days");

    expect(mockedQueryClickhouse).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("summarizes legacy integrations", async () => {
    const mockPrisma = {
      posthogIntegration: {
        findUnique: vi.fn().mockResolvedValue({
          enabled: true,
          exportSource: "TRACES_OBSERVATIONS",
        }),
      },
      mixpanelIntegration: {
        findUnique: vi.fn().mockResolvedValue({
          enabled: true,
          exportSource: "EVENTS",
        }),
      },
      blobStorageIntegration: {
        findUnique: vi.fn().mockResolvedValue({
          enabled: true,
          exportSource: "TRACES_OBSERVATIONS_EVENTS",
        }),
      },
    };
    const caller = createCaller(mockPrisma);

    await expect(caller.summary({ projectId })).resolves.toEqual({
      legacyIntegrationCount: 2,
      legacyIntegrations: {
        posthog: true,
        mixpanel: false,
        blobStorage: true,
      },
    });

    expect(mockPrisma.posthogIntegration.findUnique).toHaveBeenCalledWith({
      where: { projectId },
      select: { enabled: true, exportSource: true },
    });
    expect(mockPrisma.mixpanelIntegration.findUnique).toHaveBeenCalledWith({
      where: { projectId },
      select: { enabled: true, exportSource: true },
    });
    expect(mockPrisma.blobStorageIntegration.findUnique).toHaveBeenCalledWith({
      where: { projectId },
      select: { enabled: true, exportSource: true },
    });
  });

  it("summarizes trace-level evals", async () => {
    const mockPrisma = {
      jobConfiguration: {
        count: vi.fn().mockResolvedValue(3),
      },
    };
    const caller = createCaller(mockPrisma);

    await expect(caller.traceLevelEvalSummary({ projectId })).resolves.toEqual({
      traceLevelEvalCount: 3,
    });

    expect(mockPrisma.jobConfiguration.count).toHaveBeenCalledWith({
      where: {
        projectId,
        jobType: "EVAL",
        targetObject: "trace",
      },
    });
  });

  it("does not count disabled legacy integrations", async () => {
    const mockPrisma = {
      posthogIntegration: {
        findUnique: vi.fn().mockResolvedValue({
          enabled: false,
          exportSource: "TRACES_OBSERVATIONS",
        }),
      },
      mixpanelIntegration: {
        findUnique: vi.fn().mockResolvedValue({
          enabled: true,
          exportSource: "TRACES_OBSERVATIONS_EVENTS",
        }),
      },
      blobStorageIntegration: {
        findUnique: vi.fn().mockResolvedValue({
          enabled: false,
          exportSource: "TRACES_OBSERVATIONS_EVENTS",
        }),
      },
    };
    const caller = createCaller(mockPrisma);

    await expect(caller.summary({ projectId })).resolves.toEqual({
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
        },
      ],
    });

    expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
      where: {
        orgId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  });

  it("summarizes trace-level evals by active organization project", async () => {
    const mockPrisma = {
      project: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: projectId }, { id: secondProjectId }]),
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

    expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
      where: {
        orgId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    expect(mockPrisma.jobConfiguration.groupBy).toHaveBeenCalledWith({
      by: ["projectId"],
      where: {
        projectId: { in: [projectId, secondProjectId] },
        jobType: "EVAL",
        targetObject: "trace",
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

  it("forbids organization members from accessing org-level v4 data", async () => {
    const caller = createCaller(
      {
        project: {
          findMany: vi.fn(),
        },
      },
      createSessionWithOrgRole("MEMBER"),
    );

    await expect(caller.summaryByProject({ orgId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.traceLevelEvalSummaryByProject({
        orgId,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.legacyApiUsageSummaryByProject({
        orgId,
        fromTimestamp: new Date("2026-06-24T00:00:00Z"),
        toTimestamp: new Date("2026-06-25T00:00:00Z"),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.sdkUsageSummaryByProject({
        orgId,
        fromTimestamp: new Date("2026-06-24T00:00:00Z"),
        toTimestamp: new Date("2026-06-25T00:00:00Z"),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("queries trace-level eval execution counts with the same 2 minute buckets as the legacy API timeline", async () => {
    const mockPrisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          time: "2026-06-25T12:00:00Z",
          scoreName: "toxicity",
          count: 4n,
        },
        {
          time: "2026-06-25T12:04:00Z",
          scoreName: "helpfulness",
          count: 2,
        },
      ]),
    };
    const caller = createCaller(mockPrisma);

    const rows = await caller.traceLevelEvalExecutionsTimeSeries({
      projectId,
      fromTimestamp: new Date("2026-06-25T12:00:00Z"),
      toTimestamp: new Date("2026-06-25T13:00:00Z"),
      granularity: "auto",
    });

    expect(rows).toHaveLength(60);
    expect(rows.slice(0, 4)).toEqual([
      {
        time: "2026-06-25T12:00:00Z",
        scoreName: "helpfulness",
        count: 0,
      },
      {
        time: "2026-06-25T12:00:00Z",
        scoreName: "toxicity",
        count: 4,
      },
      {
        time: "2026-06-25T12:02:00Z",
        scoreName: "helpfulness",
        count: 0,
      },
      {
        time: "2026-06-25T12:02:00Z",
        scoreName: "toxicity",
        count: 0,
      },
    ]);
    expect(
      rows.find(
        (row) =>
          row.time === "2026-06-25T12:04:00Z" &&
          row.scoreName === "helpfulness",
      ),
    ).toEqual({
      time: "2026-06-25T12:04:00Z",
      scoreName: "helpfulness",
      count: 2,
    });
    expect(rows.at(-1)).toEqual({
      time: "2026-06-25T12:58:00Z",
      scoreName: "toxicity",
      count: 0,
    });

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    const query = mockPrisma.$queryRaw.mock.calls[0]?.[0] as
      | { sql?: string; text?: string; values?: unknown[] }
      | undefined;
    const queryText = query?.sql ?? query?.text ?? "";

    expect(queryText).toContain("date_bin(?::interval, je.created_at");
    expect(queryText).toContain(
      "INNER JOIN job_configurations jc ON jc.id = je.job_configuration_id",
    );
    expect(queryText).toContain("jc.score_name AS score_name");
    expect(queryText).toContain('score_name AS "scoreName"');
    expect(queryText).toContain("je.project_id = ?");
    expect(queryText).toContain("jc.project_id = ?");
    expect(queryText).toContain("jc.job_type = 'EVAL'");
    expect(queryText).toContain("jc.target_object = ?");
    expect(queryText).toContain("je.status != 'CANCELLED'");
    expect(queryText).toContain("je.created_at >= ?");
    expect(queryText).toContain("je.created_at <= ?");
    expect(queryText).toContain("bucket_time AT TIME ZONE 'UTC'");
    expect(queryText).toContain("GROUP BY bucket_time, score_name");
    expect(query?.values).toEqual([
      "2 minutes",
      projectId,
      projectId,
      "trace",
      new Date("2026-06-25T12:00:00Z"),
      new Date("2026-06-25T13:00:00Z"),
    ]);
  });

  it("uses hour buckets for 7 day trace-level eval execution timelines", async () => {
    const mockPrisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const caller = createCaller(mockPrisma);

    const rows = await caller.traceLevelEvalExecutionsTimeSeries({
      projectId,
      fromTimestamp: new Date("2026-06-18T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
      granularity: "auto",
    });

    expect(rows).toEqual([]);

    const query = mockPrisma.$queryRaw.mock.calls[0]?.[0] as
      | { sql?: string; text?: string; values?: unknown[] }
      | undefined;
    expect(query?.values?.[0]).toBe("1 hour");
  });

  it("queries SDK usage by exact SDK, version, and API key across event and score ingestion", async () => {
    mockedQueryClickhouse.mockResolvedValueOnce([
      {
        time: "2026-06-25T12:00:00Z",
        sdkName: "python",
        sdkVersion: "3.9.0",
        publicKey: "pk-lf-old-python",
        count: "3",
        firstSeen: "2026-06-25T12:01:00Z",
        lastSeen: "2026-06-25T12:03:00Z",
      },
      {
        time: "2026-06-25T12:04:00Z",
        sdkName: "@langfuse/tracing",
        sdkVersion: "5.1.0",
        publicKey: "pk-lf-js-current",
        count: 7,
        firstSeen: "2026-06-25T12:04:00Z",
        lastSeen: "2026-06-25T12:05:00Z",
      },
    ]);
    const caller = createCaller();

    const result = await caller.sdkUsageTimeSeries({
      projectId,
      fromTimestamp: new Date("2026-06-25T12:00:00Z"),
      toTimestamp: new Date("2026-06-25T13:00:00Z"),
      granularity: "auto",
    });
    const rows = result.rows;

    expect(result.bucketTimes).toHaveLength(30);
    expect(result.bucketTimes[0]).toBe("2026-06-25T12:00:00Z");
    expect(result.bucketTimes.at(-1)).toBe("2026-06-25T12:58:00Z");
    expect(rows).toHaveLength(2);
    expect(
      rows.find(
        (row) =>
          row.time === "2026-06-25T12:00:00Z" &&
          row.sdkName === "python" &&
          row.sdkVersion === "3.9.0" &&
          row.publicKey === "pk-lf-old-python",
      ),
    ).toEqual({
      time: "2026-06-25T12:00:00Z",
      sdkName: "python",
      sdkVersion: "3.9.0",
      publicKey: "pk-lf-old-python",
      count: 3,
      firstSeen: "2026-06-25T12:01:00Z",
      lastSeen: "2026-06-25T12:03:00Z",
      canonicalSdkName: "python",
      latestMajor: 4,
      major: 3,
      upgradeStatus: "outdated_major",
    });
    expect(
      rows.find(
        (row) =>
          row.time === "2026-06-25T12:04:00Z" &&
          row.sdkName === "@langfuse/tracing" &&
          row.sdkVersion === "5.1.0" &&
          row.publicKey === "pk-lf-js-current",
      ),
    ).toEqual({
      time: "2026-06-25T12:04:00Z",
      sdkName: "@langfuse/tracing",
      sdkVersion: "5.1.0",
      publicKey: "pk-lf-js-current",
      count: 7,
      firstSeen: "2026-06-25T12:04:00Z",
      lastSeen: "2026-06-25T12:05:00Z",
      canonicalSdkName: "javascript",
      latestMajor: 5,
      major: 5,
      upgradeStatus: "current",
    });
    expect(
      rows.find(
        (row) =>
          row.time === "2026-06-25T12:02:00Z" &&
          row.sdkName === "python" &&
          row.sdkVersion === "3.9.0" &&
          row.publicKey === "pk-lf-old-python",
      ),
    ).toBeUndefined();

    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(1);
    const clickhouseQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(clickhouseQuery?.query).toContain("FROM events_core");
    expect(clickhouseQuery?.query).toContain("UNION ALL");
    expect(clickhouseQuery?.query).toContain("FROM scores FINAL");
    expect(
      clickhouseQuery?.query.match(/project_id = \{projectId: String\}/g),
    ).toHaveLength(2);
    expect(clickhouseQuery?.query).not.toContain("system.columns");
    expect(clickhouseQuery?.query).toContain(
      "toStartOfInterval(event_time, INTERVAL 2 MINUTE, 'UTC')",
    );
    expect(clickhouseQuery?.query).toContain(
      "if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdk_name",
    );
    expect(clickhouseQuery?.query).toContain(
      "if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdk_version",
    );
    expect(clickhouseQuery?.query).toContain("ingestion_api_key AS public_key");
    expect(clickhouseQuery?.query).toContain(
      "GROUP BY toStartOfInterval(event_time, INTERVAL 2 MINUTE, 'UTC'), sdk_name, sdk_version, public_key",
    );
    expect(clickhouseQuery?.params).toMatchObject({
      projectId,
      fromTimestamp: "2026-06-25 12:00:00.000",
      toTimestamp: "2026-06-25 13:00:00.000",
    });
    expect(clickhouseQuery?.tags).toEqual({
      projectId,
      route: "v4-sdk-usage-timeseries",
    });
    expect(clickhouseQuery?.preferredClickhouseService).toBe("EventsReadOnly");
  });

  it("forbids project members and viewers from accessing project-level v4 data", async () => {
    const mockPrisma = {
      posthogIntegration: {
        findUnique: vi.fn(),
      },
      mixpanelIntegration: {
        findUnique: vi.fn(),
      },
      blobStorageIntegration: {
        findUnique: vi.fn(),
      },
      jobConfiguration: {
        count: vi.fn(),
      },
      $queryRaw: vi.fn(),
    };

    for (const role of ["MEMBER", "VIEWER"] as const) {
      const caller = createCaller(
        mockPrisma,
        createSessionWithProjectRole(role),
      );

      await expect(caller.summary({ projectId })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        caller.traceLevelEvalSummary({ projectId }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        caller.timeSeriesByEntrypoint({
          projectId,
          fromTimestamp: new Date("2026-06-25T12:00:00Z"),
          toTimestamp: new Date("2026-06-25T13:00:00Z"),
          granularity: "auto",
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        caller.traceLevelEvalExecutionsTimeSeries({
          projectId,
          fromTimestamp: new Date("2026-06-25T12:00:00Z"),
          toTimestamp: new Date("2026-06-25T13:00:00Z"),
          granularity: "auto",
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        caller.sdkUsageTimeSeries({
          projectId,
          fromTimestamp: new Date("2026-06-25T12:00:00Z"),
          toTimestamp: new Date("2026-06-25T13:00:00Z"),
          granularity: "auto",
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }

    expect(mockedQueryClickhouse).not.toHaveBeenCalled();
    expect(mockPrisma.posthogIntegration.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.mixpanelIntegration.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.blobStorageIntegration.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.jobConfiguration.count).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("queries SDK usage without a ClickHouse metadata preflight", async () => {
    mockedQueryClickhouse.mockResolvedValueOnce([
      {
        time: "2026-06-25T12:00:00Z",
        sdkName: "python",
        sdkVersion: "4.0.0",
        publicKey: "pk-lf-python",
        count: 2,
        firstSeen: "2026-06-25T12:00:00Z",
        lastSeen: "2026-06-25T12:01:00Z",
      },
    ]);
    const caller = createCaller();

    const result = await caller.sdkUsageTimeSeries({
      projectId,
      fromTimestamp: new Date("2026-06-25T12:00:00Z"),
      toTimestamp: new Date("2026-06-25T12:10:00Z"),
      granularity: "auto",
    });

    expect(result.bucketTimes).toHaveLength(10);
    expect(result.rows).toHaveLength(1);
    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(1);
    const usageQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(usageQuery?.query).toContain("FROM events_core");
    expect(usageQuery?.query).toContain("FROM scores FINAL");
    expect(usageQuery?.query).toContain("UNION ALL");
    expect(
      usageQuery?.query.match(/project_id = \{projectId: String\}/g),
    ).toHaveLength(2);
    expect(usageQuery?.query).not.toContain("system.columns");
  });

  it("rejects SDK usage requests for projects outside the caller session", async () => {
    const caller = createCaller();

    await expect(
      caller.sdkUsageTimeSeries({
        projectId: secondProjectId,
        fromTimestamp: new Date("2026-06-25T12:00:00Z"),
        toTimestamp: new Date("2026-06-25T13:00:00Z"),
        granularity: "auto",
      }),
    ).rejects.toThrow("User is not a member of this project");

    expect(mockedQueryClickhouse).not.toHaveBeenCalled();
  });

  it("summarizes outdated SDK usage series by organization project", async () => {
    mockedQueryClickhouse.mockResolvedValueOnce([
      {
        projectId,
        sdkName: "python",
        sdkVersion: "3.9.0",
        publicKey: "pk-lf-old-python",
        count: "8",
      },
      {
        projectId,
        sdkName: "python",
        sdkVersion: "4.0.0",
        publicKey: "pk-lf-current-python",
        count: "13",
      },
      {
        projectId: secondProjectId,
        sdkName: "@langfuse/tracing",
        sdkVersion: "4.2.0",
        publicKey: "pk-lf-old-js",
        count: "5",
      },
    ]);
    const mockPrisma = {
      project: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: projectId }, { id: secondProjectId }]),
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
        outdatedSdkUsageSeriesCount: 1,
      },
      {
        projectId: secondProjectId,
        outdatedSdkUsageSeriesCount: 1,
      },
    ]);

    expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
      where: {
        orgId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(1);
    const usageQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(usageQuery?.query).toContain("FROM events_core");
    expect(usageQuery?.query).toContain("UNION ALL");
    expect(usageQuery?.query).toContain("FROM scores FINAL");
    expect(usageQuery?.query).not.toContain("system.columns");
    expect(
      usageQuery?.query.match(/project_id IN \{projectIds: Array\(String\)\}/g),
    ).toHaveLength(2);
    expect(usageQuery?.query).toContain(
      "GROUP BY project_id, sdk_name, sdk_version, public_key",
    );
    expect(usageQuery?.params).toMatchObject({
      projectIds: [projectId, secondProjectId],
      fromTimestamp: "2026-06-24 00:00:00.000",
      toTimestamp: "2026-06-25 00:00:00.000",
    });
    expect(usageQuery?.tags).toEqual({
      route: "v4-org-sdk-usage-summary",
    });
  });

  it("summarizes legacy public API usage by organization project", async () => {
    mockedQueryClickhouse.mockResolvedValue([
      {
        projectId,
        entrypoint: "publicapi: GET /api/public/traces/{id}",
        count: "0.6666666666666666",
      },
      {
        projectId: secondProjectId,
        entrypoint: "publicapi: GET /api/public/metrics",
        count: 3,
      },
    ]);
    const mockPrisma = {
      project: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: projectId }, { id: secondProjectId }]),
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
      },
      {
        projectId: secondProjectId,
        entrypoint: "publicapi: GET /api/public/metrics",
        count: 3,
      },
    ]);

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
      "GROUP BY project_id, legacy_route",
    );
    expect(clickhouseQuery?.params).toMatchObject({
      projectIds: [projectId, secondProjectId],
    });
    expect(clickhouseQuery?.tags).toEqual({
      route: "v4-org-legacy-api-usage-summary",
    });
  });
});
