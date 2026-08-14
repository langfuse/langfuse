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

const sharedEnvMock = vi.hoisted(() => ({
  CLICKHOUSE_URL: "https://clickhouse-main.example.com",
  CLICKHOUSE_READ_ONLY_URL: "https://clickhouse-read.example.com",
  CLICKHOUSE_EVENTS_READ_ONLY_URL: "https://clickhouse-main.example.com",
}));

vi.mock("@langfuse/shared/src/env", () => ({ env: sharedEnvMock }));

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

/** ClickHouse mock row shaped like the SQL-classified sdkUsageSummary output. */
const mockSdkUsageRow = (overrides: {
  projectId: string;
  source?: "ingestion-api-dual-write" | "otel-dual-write" | "otel";
  ingestionPath?: "ingestion_api" | "otel";
  deliveryMode?: "delayed" | "realtime";
  sdkName?: string;
  sdkVersion?: string;
  canonicalSdkName?: "python" | "javascript" | null;
  sdkVersionMajor?: number | string | null;
  latestSdkMajor?: number | string | null;
  isValidSdkVersion?: boolean | string | number;
  attributionStatus?: string;
  publicKey?: string;
  v4MigrationStatus?: "compatible" | "upgrade_required" | "unknown";
  remediationType?:
    | "update_sdk"
    | "update_otel_instrumentation"
    | "upgrade_instrumentation";
  actionLevel?: "required" | "none";
  eventCount?: string | number;
  firstSeen?: string;
  lastSeen?: string;
}) => {
  const source = overrides.source ?? "ingestion-api-dual-write";
  const ingestionPath =
    overrides.ingestionPath ??
    (source === "ingestion-api-dual-write" ? "ingestion_api" : "otel");
  const deliveryMode =
    overrides.deliveryMode ?? (source === "otel" ? "realtime" : "delayed");
  const sdkName = overrides.sdkName ?? "python";
  const sdkVersion = overrides.sdkVersion ?? "4.7.0";
  const canonicalSdkName =
    overrides.canonicalSdkName !== undefined
      ? overrides.canonicalSdkName
      : sdkName === "python" || sdkName === "langfuse-python"
        ? ("python" as const)
        : sdkName === "javascript" || sdkName.startsWith("@langfuse/")
          ? ("javascript" as const)
          : null;
  const sdkVersionMajor =
    overrides.sdkVersionMajor !== undefined
      ? overrides.sdkVersionMajor
      : Number(sdkVersion.match(/^v?(\d+)/)?.[1] ?? NaN);
  const resolvedMajor = Number.isFinite(Number(sdkVersionMajor))
    ? Number(sdkVersionMajor)
    : null;
  const latestMajor =
    canonicalSdkName === "python"
      ? 4
      : canonicalSdkName === "javascript"
        ? 5
        : null;
  const v4MigrationStatus =
    overrides.v4MigrationStatus ??
    (canonicalSdkName === null || resolvedMajor === null
      ? "unknown"
      : resolvedMajor >= (latestMajor ?? 0)
        ? "compatible"
        : "upgrade_required");
  const remediationType =
    overrides.remediationType ??
    (canonicalSdkName !== null
      ? "update_sdk"
      : ingestionPath === "otel"
        ? "update_otel_instrumentation"
        : "upgrade_instrumentation");
  const actionLevel =
    overrides.actionLevel ??
    (remediationType === "update_sdk"
      ? v4MigrationStatus === "compatible"
        ? "none"
        : "required"
      : remediationType === "update_otel_instrumentation"
        ? deliveryMode === "realtime"
          ? "none"
          : "required"
        : "required");

  return {
    projectId: overrides.projectId,
    source,
    ingestionPath,
    deliveryMode,
    sdkName,
    sdkVersion,
    canonicalSdkName,
    sdkVersionMajor: resolvedMajor,
    latestSdkMajor:
      overrides.latestSdkMajor !== undefined
        ? overrides.latestSdkMajor
        : latestMajor,
    isValidSdkVersion: overrides.isValidSdkVersion ?? resolvedMajor !== null,
    attributionStatus:
      overrides.attributionStatus ??
      (sdkName === "unknown" && sdkVersion === "unknown"
        ? "missing_name_and_version"
        : sdkName === "unknown"
          ? "missing_name"
          : sdkVersion === "unknown"
            ? "missing_version"
            : "attributed"),
    publicKey: overrides.publicKey ?? "pk-lf-python",
    v4MigrationStatus,
    remediationType,
    actionLevel,
    eventCount: overrides.eventCount ?? "1",
    firstSeen: overrides.firstSeen ?? "2026-06-24T01:00:00Z",
    lastSeen: overrides.lastSeen ?? "2026-06-24T02:00:00Z",
  };
};

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
    sharedEnvMock.CLICKHOUSE_READ_ONLY_URL =
      "https://clickhouse-read.example.com";
    sharedEnvMock.CLICKHOUSE_EVENTS_READ_ONLY_URL =
      sharedEnvMock.CLICKHOUSE_URL;
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
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        {
          projectId,
          entrypoint: "publicapi: GET /api/public/traces/{id}",
          count: "0.6666666666666666",
          lastSeen: "2026-06-24T12:34:56.789123Z",
        },
        {
          projectId,
          entrypoint: "publicapi: GET /api/public/datasets/{datasetName}/runs",
          count: "1",
          lastSeen: "2026-06-24T14:00:00.000000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          projectId,
          entrypoint: "publicapi: GET /api/public/traces/{id}",
          count: "1.3333333333333335",
          lastSeen: "2026-06-24T15:00:00.000000Z",
        },
      ]);
    const caller = createCaller();

    const rows = await caller.legacyApiUsageSummary({
      projectId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
    });

    expect(rows).toEqual([
      {
        projectId,
        entrypoint: "publicapi: GET /api/public/datasets/{datasetName}/runs",
        count: 1,
        lastSeen: "2026-06-24T14:00:00.000000Z",
      },
      {
        projectId,
        entrypoint: "publicapi: GET /api/public/traces/{id}",
        count: 2,
        lastSeen: "2026-06-24T15:00:00.000000Z",
      },
    ]);

    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(2);
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
    expect(clickhouseQuery?.query).not.toContain("hostName()");
    expect(clickhouseQuery?.params).toMatchObject({
      projectIds: [projectId],
    });
    expect(clickhouseQuery?.tags).toEqual({
      route: "v4-legacy-api-usage-summary",
    });
    expect(clickhouseQuery?.clickhouseSettings).toEqual({
      skip_unavailable_shards: 1,
    });
    expect(mockedQueryClickhouse.mock.calls[0]?.[0]).toMatchObject({
      preferredClickhouseService: "ReadOnly",
    });
    expect(mockedQueryClickhouse.mock.calls[1]?.[0]).toMatchObject({
      preferredClickhouseService: "ReadWrite",
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
      "GET /api/public/datasets/{datasetName}/runs",
      "GET /api/public/datasets/{datasetName}/runs/{runName}",
    ].forEach((route) => expect(clickhouseQuery?.query).toContain(route));
    expect(clickhouseQuery?.query).toContain(
      "match(route_path, '^GET /api/public/datasets/[^/?#]+/runs$'), 'GET /api/public/datasets/{datasetName}/runs'",
    );
    expect(clickhouseQuery?.query).toContain(
      "match(route_path, '^GET /api/public/datasets/[^/?#]+/runs/[^/?#]+$'), 1",
    );
    expect(clickhouseQuery?.query).not.toContain("DELETE /api/public/datasets");
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

  it("queries the main service once when no separate read replica is configured", async () => {
    sharedEnvMock.CLICKHOUSE_READ_ONLY_URL = sharedEnvMock.CLICKHOUSE_URL;
    const caller = createCaller();

    await caller.legacyApiUsageSummary({
      projectId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
    });

    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(1);
    expect(mockedQueryClickhouse).toHaveBeenCalledWith(
      expect.objectContaining({ preferredClickhouseService: "ReadWrite" }),
    );
  });

  it("returns legacy API usage when one ClickHouse service is unavailable", async () => {
    mockedQueryClickhouse
      .mockRejectedValueOnce(new Error("read replica unavailable"))
      .mockResolvedValueOnce([
        {
          projectId,
          entrypoint: "publicapi: GET /api/public/traces/{id}",
          count: "1",
          lastSeen: "2026-06-24T15:00:00.000000Z",
        },
      ]);
    const caller = createCaller();

    await expect(
      caller.legacyApiUsageSummary({
        projectId,
        fromTimestamp: new Date("2026-06-24T00:00:00Z"),
        toTimestamp: new Date("2026-06-25T00:00:00Z"),
      }),
    ).resolves.toEqual([
      {
        projectId,
        entrypoint: "publicapi: GET /api/public/traces/{id}",
        count: 1,
        lastSeen: "2026-06-24T15:00:00.000000Z",
      },
    ]);

    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(2);
  });

  it("does not double-count identical results from two ClickHouse services", async () => {
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        {
          projectId,
          entrypoint: "publicapi: GET /api/public/traces/{id}",
          count: "2",
          lastSeen: "2026-06-24T14:00:00.000000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          projectId,
          entrypoint: "publicapi: GET /api/public/traces/{id}",
          count: "2",
          lastSeen: "2026-06-24T14:00:00.000000Z",
        },
      ]);
    const caller = createCaller();

    await expect(
      caller.legacyApiUsageSummary({
        projectId,
        fromTimestamp: new Date("2026-06-24T00:00:00Z"),
        toTimestamp: new Date("2026-06-25T00:00:00Z"),
      }),
    ).resolves.toEqual([
      {
        projectId,
        entrypoint: "publicapi: GET /api/public/traces/{id}",
        count: 2,
        lastSeen: "2026-06-24T14:00:00.000000Z",
      },
    ]);
  });

  it("queries SDK usage for only the authorized project", async () => {
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        mockSdkUsageRow({
          projectId,
          sdkName: "python",
          sdkVersion: "4.7.0",
          publicKey: "pk-lf-python",
          eventCount: "2",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T02:00:00Z",
        }),
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
          source: "ingestion-api-dual-write",
          ingestionPath: "ingestion_api",
          deliveryMode: "delayed",
          sdkName: "python",
          sdkVersion: "4.7.0",
          eventCount: 2,
          v4MigrationStatus: "compatible",
          remediationType: "update_sdk",
          actionLevel: "none",
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
        mockSdkUsageRow({
          projectId,
          sdkName: "python",
          sdkVersion: "3.9.0",
          publicKey: "pk-lf-python",
          eventCount: "8",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T02:00:00Z",
        }),
        mockSdkUsageRow({
          projectId,
          sdkName: "python",
          sdkVersion: "4.14.1",
          publicKey: "pk-lf-python",
          eventCount: "13",
          firstSeen: "2026-06-24T03:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
        }),
        mockSdkUsageRow({
          projectId,
          sdkName: "python",
          sdkVersion: "4.6.9",
          publicKey: "pk-lf-pre-v4-python",
          eventCount: "5",
          firstSeen: "2026-06-24T12:00:00Z",
          lastSeen: "2026-06-24T13:00:00Z",
        }),
        mockSdkUsageRow({
          projectId,
          sdkName: "python",
          sdkVersion: "4.7.0",
          publicKey: "pk-lf-current-python",
          eventCount: "6",
          firstSeen: "2026-06-24T13:30:00Z",
          lastSeen: "2026-06-24T14:00:00Z",
        }),
        mockSdkUsageRow({
          projectId: secondProjectId,
          sdkName: "@langfuse/tracing",
          sdkVersion: "5.3.9",
          publicKey: "pk-lf-old-js",
          eventCount: "5",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
        }),
        mockSdkUsageRow({
          projectId: secondProjectId,
          source: "otel",
          sdkName: "unknown",
          sdkVersion: "unknown",
          publicKey: "pk-lf-otel",
          eventCount: "3",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
        }),
        mockSdkUsageRow({
          projectId: secondProjectId,
          source: "otel-dual-write",
          sdkName: "custom-otel-writer",
          sdkVersion: "1.2.3",
          publicKey: "pk-lf-custom-otel",
          eventCount: "2",
          firstSeen: "2026-06-24T02:00:00Z",
          lastSeen: "2026-06-24T03:00:00Z",
        }),
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
            source: "ingestion-api-dual-write",
            ingestionPath: "ingestion_api",
            deliveryMode: "delayed",
            sdkName: "python",
            sdkVersion: "3.9.0",
            canonicalSdkName: "python",
            sdkVersionMajor: 3,
            latestSdkMajor: 4,
            isValidSdkVersion: true,
            publicKey: "pk-lf-python",
            eventCount: 8,
            firstSeen: "2026-06-24T01:00:00Z",
            lastSeen: "2026-06-24T02:00:00Z",
            attributionStatus: "attributed",
            v4MigrationStatus: "upgrade_required",
            remediationType: "update_sdk",
            actionLevel: "required",
          },
          {
            source: "ingestion-api-dual-write",
            ingestionPath: "ingestion_api",
            deliveryMode: "delayed",
            sdkName: "python",
            sdkVersion: "4.14.1",
            canonicalSdkName: "python",
            sdkVersionMajor: 4,
            latestSdkMajor: 4,
            isValidSdkVersion: true,
            publicKey: "pk-lf-python",
            eventCount: 13,
            firstSeen: "2026-06-24T03:00:00Z",
            lastSeen: "2026-06-24T04:00:00Z",
            attributionStatus: "attributed",
            v4MigrationStatus: "compatible",
            remediationType: "update_sdk",
            actionLevel: "none",
          },
          {
            source: "ingestion-api-dual-write",
            ingestionPath: "ingestion_api",
            deliveryMode: "delayed",
            sdkName: "python",
            sdkVersion: "4.6.9",
            canonicalSdkName: "python",
            sdkVersionMajor: 4,
            latestSdkMajor: 4,
            isValidSdkVersion: true,
            publicKey: "pk-lf-pre-v4-python",
            eventCount: 5,
            firstSeen: "2026-06-24T12:00:00Z",
            lastSeen: "2026-06-24T13:00:00Z",
            attributionStatus: "attributed",
            // Latest-major semantics: current major is compatible (no minor advice).
            v4MigrationStatus: "compatible",
            remediationType: "update_sdk",
            actionLevel: "none",
          },
          {
            source: "ingestion-api-dual-write",
            ingestionPath: "ingestion_api",
            deliveryMode: "delayed",
            sdkName: "python",
            sdkVersion: "4.7.0",
            canonicalSdkName: "python",
            sdkVersionMajor: 4,
            latestSdkMajor: 4,
            isValidSdkVersion: true,
            publicKey: "pk-lf-current-python",
            eventCount: 6,
            firstSeen: "2026-06-24T13:30:00Z",
            lastSeen: "2026-06-24T14:00:00Z",
            attributionStatus: "attributed",
            v4MigrationStatus: "compatible",
            remediationType: "update_sdk",
            actionLevel: "none",
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
            source: "ingestion-api-dual-write",
            ingestionPath: "ingestion_api",
            deliveryMode: "delayed",
            sdkName: "@langfuse/tracing",
            sdkVersion: "5.3.9",
            canonicalSdkName: "javascript",
            sdkVersionMajor: 5,
            latestSdkMajor: 5,
            isValidSdkVersion: true,
            publicKey: "pk-lf-old-js",
            eventCount: 5,
            firstSeen: "2026-06-24T01:00:00Z",
            lastSeen: "2026-06-24T04:00:00Z",
            attributionStatus: "attributed",
            v4MigrationStatus: "compatible",
            remediationType: "update_sdk",
            actionLevel: "none",
          },
          {
            source: "otel",
            ingestionPath: "otel",
            deliveryMode: "realtime",
            sdkName: "unknown",
            sdkVersion: "unknown",
            canonicalSdkName: null,
            sdkVersionMajor: null,
            latestSdkMajor: null,
            isValidSdkVersion: false,
            publicKey: "pk-lf-otel",
            eventCount: 3,
            firstSeen: "2026-06-24T01:00:00Z",
            lastSeen: "2026-06-24T04:00:00Z",
            attributionStatus: "missing_name_and_version",
            v4MigrationStatus: "unknown",
            remediationType: "update_otel_instrumentation",
            actionLevel: "none",
          },
          {
            source: "otel-dual-write",
            ingestionPath: "otel",
            deliveryMode: "delayed",
            sdkName: "custom-otel-writer",
            sdkVersion: "1.2.3",
            canonicalSdkName: null,
            sdkVersionMajor: 1,
            latestSdkMajor: null,
            isValidSdkVersion: true,
            publicKey: "pk-lf-custom-otel",
            eventCount: 2,
            firstSeen: "2026-06-24T02:00:00Z",
            lastSeen: "2026-06-24T03:00:00Z",
            attributionStatus: "attributed",
            v4MigrationStatus: "unknown",
            remediationType: "update_otel_instrumentation",
            actionLevel: "required",
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
      "source IN {ingressSources: Array(String)}",
    );
    expect(usageQuery?.query).not.toContain("system.columns");
    expect(
      usageQuery?.query.match(/project_id IN \{projectIds: Array\(String\)\}/g),
    ).toHaveLength(1);
    expect(usageQuery?.query).toContain(
      "GROUP BY projectId, source, sdkName, sdkVersion, publicKey",
    );
    expect(usageQuery?.query).toContain(
      "if(source = 'otel', 'realtime', 'delayed') AS deliveryMode",
    );
    expect(usageQuery?.query).not.toContain("hasDelayedOtelEvents");
    expect(usageQuery?.query).toContain(
      "formatDateTime(firstSeenAt, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS firstSeen",
    );
    expect(usageQuery?.query).toContain(
      "formatDateTime(lastSeenAt, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS lastSeen",
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
      ingressSources: ["ingestion-api-dual-write", "otel-dual-write", "otel"],
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
    expect(experimentUsageQuery?.query).not.toContain("hostName()");
    expect(experimentUsageQuery?.params).toMatchObject({
      projectIds: [projectId, secondProjectId],
      fromTimestamp: "2026-06-24 00:00:00.000",
      toTimestamp: "2026-06-25 00:00:00.000",
    });
    expect(experimentUsageQuery?.tags).toEqual({
      route: "v4-experiment-instrumentation-summary",
    });
  });

  it("finds dataset-run-items POST usage when only the main service has it", async () => {
    sharedEnvMock.CLICKHOUSE_EVENTS_READ_ONLY_URL =
      "https://clickhouse-events-read.example.com";
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        mockSdkUsageRow({
          projectId,
          source: "otel",
          sdkName: "unknown",
          sdkVersion: "unknown",
        }),
      ])
      .mockRejectedValueOnce(new Error("events read replica unavailable"))
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
    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(3);
    expect(mockedQueryClickhouse.mock.calls[1]?.[0]).toMatchObject({
      preferredClickhouseService: "EventsReadOnly",
    });
    expect(mockedQueryClickhouse.mock.calls[2]?.[0]).toMatchObject({
      preferredClickhouseService: "ReadWrite",
    });
  });

  it("summarizes SDK usage for a single project with exactly that projectId", async () => {
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        mockSdkUsageRow({
          projectId,
          sdkName: "python",
          sdkVersion: "4.7.0",
          publicKey: "pk-lf-python",
          eventCount: "6",
          firstSeen: "2026-06-24T13:30:00Z",
          lastSeen: "2026-06-24T14:00:00Z",
        }),
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
          remediationType: "update_sdk",
          actionLevel: "none",
          eventCount: 6,
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

  it("keeps source-specific series and consumes SQL-owned classification", async () => {
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        {
          projectId,
          source: "otel-dual-write",
          ingestionPath: "otel",
          deliveryMode: "delayed",
          sdkName: "unknown",
          sdkVersion: "unknown",
          canonicalSdkName: null,
          sdkVersionMajor: null,
          isValidSdkVersion: false,
          attributionStatus: "missing_name_and_version",
          publicKey: "pk-lf-shared",
          v4MigrationStatus: "unknown",
          remediationType: "update_otel_instrumentation",
          actionLevel: "required",
          eventCount: "3",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T02:00:00Z",
        },
        {
          projectId,
          source: "ingestion-api-dual-write",
          ingestionPath: "ingestion_api",
          deliveryMode: "delayed",
          sdkName: "unknown",
          sdkVersion: "unknown",
          canonicalSdkName: null,
          sdkVersionMajor: null,
          isValidSdkVersion: false,
          attributionStatus: "missing_name_and_version",
          publicKey: "pk-lf-shared",
          v4MigrationStatus: "unknown",
          remediationType: "upgrade_instrumentation",
          actionLevel: "required",
          eventCount: "2",
          firstSeen: "2026-06-24T03:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
        },
      ])
      .mockResolvedValueOnce([]);
    const caller = createCaller();

    const summary = await caller.sdkUsageSummary({
      projectId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
    });

    expect(summary.sdkUsageSeries).toEqual([
      expect.objectContaining({
        source: "otel-dual-write",
        remediationType: "update_otel_instrumentation",
        eventCount: 3,
      }),
      expect.objectContaining({
        source: "ingestion-api-dual-write",
        remediationType: "upgrade_instrumentation",
        eventCount: 2,
      }),
    ]);

    const usageQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(usageQuery?.query).toContain(
      "GROUP BY projectId, source, sdkName, sdkVersion, publicKey",
    );
    expect(usageQuery?.query).toContain(
      "source IN {ingressSources: Array(String)}",
    );
    expect(usageQuery?.query).toContain(
      "if(source = 'otel', 'realtime', 'delayed') AS deliveryMode",
    );
    expect(usageQuery?.query).not.toContain("hasDelayedOtelEvents");
    expect(usageQuery?.params).toMatchObject({
      ingressSources: ["ingestion-api-dual-write", "otel-dual-write", "otel"],
    });
  });

  it("requires removing dataset-run-items POST usage for native OTel instrumentation", async () => {
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        mockSdkUsageRow({
          projectId,
          source: "otel",
          sdkName: "unknown",
          sdkVersion: "unknown",
          publicKey: "pk-lf-otel",
          eventCount: "3",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
        }),
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
        mockSdkUsageRow({
          projectId,
          sdkName: "python",
          sdkVersion: "3.9.0",
          publicKey: "pk-lf-python",
          eventCount: "3",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
        }),
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
          remediationType: "update_sdk",
          actionLevel: "required",
        },
      ],
    });
  });

  it("requires an API upgrade when POST usage predates the experiment runner", async () => {
    mockedQueryClickhouse
      .mockResolvedValueOnce([
        mockSdkUsageRow({
          projectId,
          sdkName: "python",
          sdkVersion: "3.3.5",
          publicKey: "pk-lf-python",
          eventCount: "3",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
        }),
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
        mockSdkUsageRow({
          projectId,
          sdkName: "python",
          sdkVersion: "4.0.0",
          publicKey: "pk-lf-python",
          eventCount: "3",
          firstSeen: "2026-06-24T01:00:00Z",
          lastSeen: "2026-06-24T04:00:00Z",
        }),
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
    mockedQueryClickhouse
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce([
        {
          projectId,
          entrypoint: "publicapi: GET /api/public/traces/{id}",
          count: "0.3333333333333334",
          lastSeen: "2026-06-24T14:00:00.000000Z",
        },
        {
          projectId: secondProjectId,
          entrypoint: "publicapi: GET /api/public/metrics",
          count: 2,
          lastSeen: "2026-06-24T16:00:00.000000Z",
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
        count: 1,
        lastSeen: "2026-06-24T14:00:00.000000Z",
      },
      {
        projectId: secondProjectId,
        entrypoint: "publicapi: GET /api/public/metrics",
        count: 5,
        lastSeen: "2026-06-24T16:00:00.000000Z",
      },
    ]);

    expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
      accessibleProjectsFindManyArgs,
    );
    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(2);
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
    expect(mockedQueryClickhouse.mock.calls[0]?.[0]).toMatchObject({
      preferredClickhouseService: "ReadOnly",
    });
    expect(mockedQueryClickhouse.mock.calls[1]?.[0]).toMatchObject({
      preferredClickhouseService: "ReadWrite",
    });
  });
});
