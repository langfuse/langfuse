import type { Session } from "next-auth";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { v4TransitionRouter } from "@/src/features/v4/server/v4TransitionRouter";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { queryClickhouse } from "@langfuse/shared/src/server";

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: vi.fn(),
}));

/**
 * In-memory Redis stand-in for cache tests. Avoids a real localhost:6379
 * dependency so the redis-cluster CI matrix (no standalone Redis) stays green.
 * Most tests keep `available=false` to exercise the direct-query path.
 */
const redisAvailability = vi.hoisted(() => ({
  available: false,
}));

const memoryRedis = vi.hoisted(() => {
  type Entry = { value: string; expiresAtMs: number | null };
  const store = new Map<string, Entry>();
  const nowMs = () => Date.now();
  const isLive = (entry: Entry | undefined) =>
    entry != null && (entry.expiresAtMs == null || entry.expiresAtMs > nowMs());

  const client = {
    get status() {
      return redisAvailability.available ? "ready" : "end";
    },
    disconnect: vi.fn(),
    ping: async () => "PONG",
    get: async (key: string) => {
      const entry = store.get(key);
      if (!isLive(entry)) {
        store.delete(key);
        return null;
      }
      return entry!.value;
    },
    mget: async (...keysOrArray: string[] | [string[]]) => {
      const keys =
        keysOrArray.length === 1 && Array.isArray(keysOrArray[0])
          ? keysOrArray[0]
          : (keysOrArray as string[]);
      return Promise.all(keys.map((key) => client.get(key)));
    },
    setex: async (key: string, ttlSeconds: number, value: string) => {
      store.set(key, {
        value,
        expiresAtMs: nowMs() + ttlSeconds * 1000,
      });
      return "OK";
    },
    del: async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) {
        if (store.delete(key)) removed += 1;
      }
      return removed;
    },
    ttl: async (key: string) => {
      const entry = store.get(key);
      if (!isLive(entry)) {
        store.delete(key);
        return -2;
      }
      if (entry!.expiresAtMs == null) return -1;
      return Math.max(0, Math.ceil((entry!.expiresAtMs - nowMs()) / 1000));
    },
    scan: async (
      cursor: string,
      _matchToken: string,
      pattern: string,
      _countToken: string,
      _count: number,
    ) => {
      const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
      const keys = [...store.keys()].filter((key) =>
        pattern.endsWith("*") ? key.startsWith(prefix) : key === pattern,
      );
      // Single-page scan: first call returns all keys, next cursor is "0".
      if (cursor !== "0") return ["0", [] as string[]];
      return ["0", keys];
    },
    __store: store,
    __reset() {
      store.clear();
    },
  };
  return client;
});

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

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal();
  const { ROOT_CONTEXT } = await import("@opentelemetry/api");

  return {
    ...(actual as object),
    ...sharedServerMock,
    getTraceById: vi.fn(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    redis: memoryRedis,
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

// The server computes its own detection window from "now" (hour-aligned);
// tests pin the clock so query params and trimming are deterministic.
const TEST_NOW = new Date("2026-06-25T00:30:00Z");
const HOT_START_ISO = "2026-06-25T00:00:00.000Z";
const HOT_START_CLICKHOUSE = "2026-06-25 00:00:00.000";
const WINDOW_START_CLICKHOUSE = "2026-06-22 01:00:00.000";
// Recent SDK gap cutoff: TEST_NOW floored to the minute (zero
// seconds/millis) so repeated calls within the minute share one ClickHouse
// query-cache key.
const RECENT_CUTOFF_CLICKHOUSE = "2026-06-25 00:30:00.000";

const sdkUsageCacheKey = `langfuse:v4:sdk-usage:v1:${projectId}`;
const legacyApiUsageCacheKey = `langfuse:v4:legacy-api-usage:v1:${projectId}`;
const experimentPostUsageCacheKey = `langfuse:v4:experiment-post-usage:v1:${projectId}`;

const experimentPostBlob = (
  used: boolean,
  lastSeen: string | null = used ? "2026-06-24T15:00:00.000000Z" : null,
) =>
  JSON.stringify({
    version: 1,
    computedAt: "2026-06-25T00:00:00.000Z",
    used,
    lastSeen,
  });

const legacyApiBlob = (
  rows: {
    entrypoint: string;
    count: number;
    lastSeen: string;
    callers?: {
      sdkName?: "python" | "javascript";
      sdkVersion?: string;
      userAgent?: string;
      isOther?: true;
      count: number;
      lastSeen: string;
    }[];
  }[],
) =>
  JSON.stringify({
    version: 1,
    computedAt: "2026-06-25T00:00:00.000Z",
    rows,
  });

const legacyApiUsageHeartbeatKey = "langfuse:v4:legacy-api-usage:heartbeat:v1";

const DEFAULT_SEED_TTL_SECONDS = 60 * 60;

const clearV4CacheKeys = async () => {
  memoryRedis.__reset();
};

/** Seed in-memory Redis keys and enable the cache for the code under test. */
const seedRedisCache = async (
  initialEntries: Record<string, string> = {},
  ttlSeconds = DEFAULT_SEED_TTL_SECONDS,
) => {
  await clearV4CacheKeys();
  redisAvailability.available = true;
  if (Object.keys(initialEntries).length === 0) return;
  await Promise.all(
    Object.entries(initialEntries).map(([key, value]) =>
      memoryRedis.setex(key, ttlSeconds, value),
    ),
  );
};

const readRedisJson = async (key: string) => {
  const raw = await memoryRedis.get(key);
  return raw === null ? null : JSON.parse(raw);
};

const readRedisTtl = async (key: string) => memoryRedis.ttl(key);

describe("v4TransitionRouter", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(TEST_NOW);
    redisAvailability.available = false;
    await clearV4CacheKeys();
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

  afterEach(async () => {
    redisAvailability.available = false;
    await clearV4CacheKeys();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("serves legacy public API usage from Redis without querying ClickHouse", async () => {
    await seedRedisCache({
      [legacyApiUsageCacheKey]: legacyApiBlob([
        {
          entrypoint: "publicapi: GET /api/public/datasets/{datasetName}/runs",
          count: 1,
          lastSeen: "2026-06-24T14:00:00.000000Z",
        },
        {
          entrypoint: "publicapi: GET /api/public/traces/{id}",
          count: 2,
          lastSeen: "2026-06-24T15:00:00.000000Z",
          callers: [
            {
              sdkName: "python",
              sdkVersion: "4.8.1",
              userAgent: "langfuse-python/4.8.1",
              count: 2,
              lastSeen: "2026-06-24T15:00:00.000000Z",
            },
          ],
        },
      ]),
    });
    const caller = createCaller();

    const rows = await caller.legacyApiUsageSummary({
      projectId,
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
        callers: [
          {
            sdkName: "python",
            sdkVersion: "4.8.1",
            userAgent: "langfuse-python/4.8.1",
            count: 2,
            lastSeen: "2026-06-24T15:00:00.000000Z",
          },
        ],
      },
    ]);
    expect(mockedQueryClickhouse).not.toHaveBeenCalled();
  });

  it("treats missing legacy API Redis entries as no usage", async () => {
    await seedRedisCache();
    const caller = createCaller();

    await expect(
      caller.legacyApiUsageSummary({
        projectId,
      }),
    ).resolves.toEqual([]);
    expect(mockedQueryClickhouse).not.toHaveBeenCalled();
    await expect(readRedisJson(legacyApiUsageCacheKey)).resolves.toBeNull();
  });

  it("returns the complete project migration data for agent consumers", async () => {
    await seedRedisCache({
      [legacyApiUsageCacheKey]: legacyApiBlob([
        {
          entrypoint: "publicapi: GET /api/public/traces/{id}",
          count: 2,
          lastSeen: "2026-06-24T15:00:00.000000Z",
        },
      ]),
    });
    mockedQueryClickhouse.mockResolvedValueOnce([
      mockSdkUsageRow({
        projectId,
        sdkName: "python",
        sdkVersion: "3.9.0",
        actionLevel: "required",
      }),
    ]);
    const caller = createCaller({
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
        findMany: vi.fn().mockResolvedValue([]),
      },
      blobStorageIntegration: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      evaluationRule: {
        groupBy: vi
          .fn()
          .mockResolvedValue([{ projectId, _count: { _all: 2 } }]),
      },
    });

    const result = await caller.migrationData({ projectId });

    expect(result).toMatchObject({
      projectId,
      forceV3Experience: false,
      sdkUsage: {
        projectId,
        sdkUsageSeries: expect.arrayContaining([
          expect.objectContaining({
            sdkName: "python",
            sdkVersion: "3.9.0",
            actionLevel: "required",
          }),
        ]),
      },
      legacyIntegrations: {
        projectId,
        legacyIntegrationCount: 1,
        legacyIntegrations: {
          posthog: true,
          mixpanel: false,
          blobStorage: false,
        },
      },
      legacyApiUsage: [
        {
          projectId,
          entrypoint: "publicapi: GET /api/public/traces/{id}",
          count: 2,
        },
      ],
      traceLevelEvals: {
        projectId,
        traceLevelEvalCount: 2,
      },
    });
  });

  it("queries SDK usage for only the authorized project", async () => {
    mockedQueryClickhouse.mockResolvedValueOnce([
      mockSdkUsageRow({
        projectId,
        sdkName: "python",
        sdkVersion: "4.7.0",
        publicKey: "pk-lf-python",
        eventCount: "2",
        firstSeen: "2026-06-24T01:00:00Z",
        lastSeen: "2026-06-24T02:00:00Z",
      }),
    ]);
    const caller = createCaller();

    const summary = await caller.sdkUsageSummary({
      projectId,
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
    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(1);
    expect(mockedQueryClickhouse.mock.calls[0]?.[0].params).toMatchObject({
      projectIds: [projectId],
    });
  });

  it("rejects project summaries outside the caller session", async () => {
    const caller = createCaller();
    const range = {};

    await expect(
      caller.sdkUsageSummary({ projectId: outsideProjectId, ...range }),
    ).rejects.toThrow("User is not a member of this project");
    await expect(
      caller.legacyApiUsageSummary({
        projectId: outsideProjectId,
        ...range,
      }),
    ).rejects.toThrow("User is not a member of this project");
    await expect(
      caller.migrationData({
        projectId: outsideProjectId,
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
      evaluationRule: {
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

    expect(mockPrisma.evaluationRule.groupBy).toHaveBeenCalledWith({
      by: ["projectId"],
      where: {
        projectId: { in: [projectId] },
        targetObject: { in: ["trace", "dataset"] },
        status: "ACTIVE",
        timeScope: { has: "NEW" },
      },
      _count: { _all: true },
    });
  });

  it("returns zero evals when no active configs exist", async () => {
    const mockPrisma = {
      evaluationRule: {
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
      evaluationRule: {
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
    expect(mockPrisma.evaluationRule.groupBy).toHaveBeenCalledWith({
      by: ["projectId"],
      where: {
        projectId: { in: [projectId, secondProjectId] },
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
    mockedQueryClickhouse.mockResolvedValueOnce([
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

    const rows = await caller.sdkUsageSummaryByProject({
      orgId,
    });

    expect(rows).toEqual([
      {
        projectId,
        experimentInstrumentationMigration: {
          status: "not_required",
          upgradePath: null,
        },
        // Most recently seen first: the server re-sorts after merging cached
        // and live series.
        sdkUsageSeries: [
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
    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(1);
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
      fromTimestamp: WINDOW_START_CLICKHOUSE,
      toTimestamp: RECENT_CUTOFF_CLICKHOUSE,
      ingressSources: ["ingestion-api-dual-write", "otel-dual-write", "otel"],
    });
    expect(usageQuery?.tags).toEqual({
      route: "v4-sdk-usage-summary",
    });
    expect(usageQuery?.clickhouseSettings).toEqual({
      use_query_cache: 1,
      query_cache_ttl: 300,
    });
  });

  it("requires an API upgrade when Redis shows dataset-run-items POST usage", async () => {
    await seedRedisCache({
      [experimentPostUsageCacheKey]: experimentPostBlob(true),
    });
    // Redis is available but the SDK blob is missing: historical + live gap.
    mockedQueryClickhouse.mockResolvedValue([
      mockSdkUsageRow({
        projectId,
        sdkName: "python",
        sdkVersion: "3.3.5",
        publicKey: "pk-lf-python",
      }),
    ]);
    const caller = createCaller({
      project: {
        findMany: vi.fn().mockResolvedValue([{ id: projectId }]),
      },
    });

    const [summary] = await caller.sdkUsageSummaryByProject({
      orgId,
    });

    expect(summary?.experimentInstrumentationMigration).toEqual({
      status: "required",
      upgradePath: "api",
    });
    const eventsCoreCalls = mockedQueryClickhouse.mock.calls.filter(([args]) =>
      args.query.includes("FROM events_core"),
    );
    expect(eventsCoreCalls).toHaveLength(2);
    expect(
      mockedQueryClickhouse.mock.calls.some(([args]) =>
        args.query.includes("system.query_log"),
      ),
    ).toBe(false);
  });

  it("summarizes SDK usage for a single project with exactly that projectId", async () => {
    mockedQueryClickhouse.mockResolvedValueOnce([
      mockSdkUsageRow({
        projectId,
        sdkName: "python",
        sdkVersion: "4.7.0",
        publicKey: "pk-lf-python",
        eventCount: "6",
        firstSeen: "2026-06-24T13:30:00Z",
        lastSeen: "2026-06-24T14:00:00Z",
      }),
    ]);

    const caller = createCaller();

    const summary = await caller.sdkUsageSummary({
      projectId,
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

    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(1);
    expect(mockedQueryClickhouse.mock.calls[0]?.[0]?.params).toMatchObject({
      projectIds: [projectId],
    });
    expect(mockedQueryClickhouse.mock.calls[0]?.[0]?.tags).toEqual({
      route: "v4-sdk-usage-summary",
    });
  });

  it("keeps source-specific series and consumes SQL-owned classification", async () => {
    mockedQueryClickhouse.mockResolvedValueOnce([
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
    ]);
    const caller = createCaller();

    const summary = await caller.sdkUsageSummary({
      projectId,
    });

    // Sorted by lastSeen descending after the merge step.
    expect(summary.sdkUsageSeries).toEqual([
      expect.objectContaining({
        source: "ingestion-api-dual-write",
        remediationType: "upgrade_instrumentation",
        eventCount: 2,
      }),
      expect.objectContaining({
        source: "otel-dual-write",
        remediationType: "update_otel_instrumentation",
        eventCount: 3,
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
    await seedRedisCache({
      [experimentPostUsageCacheKey]: experimentPostBlob(true),
    });
    mockedQueryClickhouse.mockResolvedValue([
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
    ]);
    const caller = createCaller({
      project: {
        findMany: vi.fn().mockResolvedValue([{ id: projectId }]),
      },
    });

    const [summary] = await caller.sdkUsageSummaryByProject({
      orgId,
    });

    expect(summary).toMatchObject({
      projectId,
      experimentInstrumentationMigration: {
        status: "required",
        upgradePath: "api",
      },
    });
  });

  it("keeps SDK usage when experiment POST Redis data is missing", async () => {
    // No worker entry and no query_log fallback: experiment stays not_required.
    mockedQueryClickhouse.mockResolvedValueOnce([
      mockSdkUsageRow({
        projectId,
        sdkName: "python",
        sdkVersion: "3.9.0",
        publicKey: "pk-lf-python",
        eventCount: "3",
        firstSeen: "2026-06-24T01:00:00Z",
        lastSeen: "2026-06-24T04:00:00Z",
      }),
    ]);
    const caller = createCaller({
      project: {
        findMany: vi.fn().mockResolvedValue([{ id: projectId }]),
      },
    });

    const [summary] = await caller.sdkUsageSummaryByProject({
      orgId,
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
          sdkVersion: "3.9.0",
          v4MigrationStatus: "upgrade_required",
          remediationType: "update_sdk",
          actionLevel: "required",
        },
      ],
    });
  });

  it("requires an API upgrade when POST usage predates the experiment runner", async () => {
    await seedRedisCache({
      [experimentPostUsageCacheKey]: experimentPostBlob(true),
    });
    mockedQueryClickhouse.mockResolvedValue([
      mockSdkUsageRow({
        projectId,
        sdkName: "python",
        sdkVersion: "3.3.5",
        publicKey: "pk-lf-python",
        eventCount: "3",
        firstSeen: "2026-06-24T01:00:00Z",
        lastSeen: "2026-06-24T04:00:00Z",
      }),
    ]);
    const caller = createCaller({
      project: {
        findMany: vi.fn().mockResolvedValue([{ id: projectId }]),
      },
    });

    const [summary] = await caller.sdkUsageSummaryByProject({
      orgId,
    });

    expect(summary?.experimentInstrumentationMigration).toEqual({
      status: "required",
      upgradePath: "api",
    });
  });

  it("does not require an upgrade for current experiment instrumentation", async () => {
    await seedRedisCache({
      [experimentPostUsageCacheKey]: experimentPostBlob(true),
    });
    mockedQueryClickhouse.mockResolvedValue([
      mockSdkUsageRow({
        projectId,
        sdkName: "python",
        sdkVersion: "4.0.0",
        publicKey: "pk-lf-python",
        eventCount: "3",
        firstSeen: "2026-06-24T01:00:00Z",
        lastSeen: "2026-06-24T04:00:00Z",
      }),
    ]);
    const caller = createCaller({
      project: {
        findMany: vi.fn().mockResolvedValue([{ id: projectId }]),
      },
    });

    const [summary] = await caller.sdkUsageSummaryByProject({
      orgId,
    });

    expect(summary?.experimentInstrumentationMigration).toEqual({
      status: "not_required",
      upgradePath: null,
    });
  });

  it("summarizes legacy public API usage by organization project from Redis", async () => {
    await seedRedisCache({
      [legacyApiUsageCacheKey]: legacyApiBlob([
        {
          entrypoint: "publicapi: GET /api/public/traces/{id}",
          count: 1,
          lastSeen: "2026-06-24T14:00:00.000000Z",
        },
      ]),
      [`langfuse:v4:legacy-api-usage:v1:${secondProjectId}`]: legacyApiBlob([
        {
          entrypoint: "publicapi: GET /api/public/metrics",
          count: 5,
          lastSeen: "2026-06-24T16:00:00.000000Z",
        },
      ]),
    });
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
    expect(mockedQueryClickhouse).not.toHaveBeenCalled();
  });

  describe("redis caching", () => {
    /** Series entry as stored in the SDK usage cache blob (numbers, not SQL strings). */
    const cachedSdkSeries = (
      overrides: Partial<{
        sdkVersion: string;
        publicKey: string;
        v4MigrationStatus: "compatible" | "upgrade_required" | "unknown";
        actionLevel: "required" | "none";
        eventCount: number;
        firstSeen: string;
        lastSeen: string;
      }> = {},
    ) => ({
      source: "ingestion-api-dual-write" as const,
      ingestionPath: "ingestion_api" as const,
      deliveryMode: "delayed" as const,
      sdkName: "python",
      sdkVersion: "3.9.0",
      canonicalSdkName: "python" as const,
      sdkVersionMajor: 3,
      latestSdkMajor: 4,
      isValidSdkVersion: true,
      attributionStatus: "attributed" as const,
      publicKey: "pk-lf-python",
      v4MigrationStatus: "upgrade_required" as const,
      remediationType: "update_sdk" as const,
      actionLevel: "required" as const,
      eventCount: 5,
      firstSeen: "2026-06-20T01:00:00Z",
      lastSeen: "2026-06-24T10:00:00Z",
      ...overrides,
    });

    const sdkUsageBlob = (series: unknown[], hotStart = HOT_START_ISO) =>
      JSON.stringify({
        version: 1,
        computedAt: "2026-06-25T00:00:00.000Z",
        hotStart,
        series,
      });

    it("splits SDK usage into a cached-historical and a live-gap query on cache miss", async () => {
      await seedRedisCache();
      const historicalRow = mockSdkUsageRow({
        projectId,
        sdkName: "python",
        sdkVersion: "3.9.0",
        publicKey: "pk-lf-python",
        eventCount: "5",
        firstSeen: "2026-06-20T01:00:00Z",
        lastSeen: "2026-06-24T10:00:00Z",
      });
      const gapRow = mockSdkUsageRow({
        projectId,
        sdkName: "python",
        sdkVersion: "3.9.0",
        publicKey: "pk-lf-python",
        eventCount: "2",
        firstSeen: "2026-06-25T00:05:00Z",
        lastSeen: "2026-06-25T00:15:00Z",
      });
      mockedQueryClickhouse.mockImplementation(async (args) => {
        if (!args.query.includes("FROM events_core")) return [];
        return (args.params?.toTimestamp as string) === HOT_START_CLICKHOUSE
          ? [historicalRow]
          : [gapRow];
      });
      const caller = createCaller();

      const summary = await caller.sdkUsageSummary({
        projectId,
      });

      // One merged series: counts add, seen-range unions across the boundary.
      expect(summary.sdkUsageSeries).toEqual([
        expect.objectContaining({
          sdkVersion: "3.9.0",
          eventCount: 7,
          firstSeen: "2026-06-20T01:00:00Z",
          lastSeen: "2026-06-25T00:15:00Z",
        }),
      ]);

      const eventsCoreCalls = mockedQueryClickhouse.mock.calls.filter(
        ([args]) => args.query.includes("FROM events_core"),
      );
      expect(eventsCoreCalls).toHaveLength(2);
      const [historicalCall] = eventsCoreCalls.filter(
        ([args]) => args.params?.toTimestamp === HOT_START_CLICKHOUSE,
      );
      const [gapCall] = eventsCoreCalls.filter(
        ([args]) => args.params?.toTimestamp === RECENT_CUTOFF_CLICKHOUSE,
      );
      // Half-open boundary: an event exactly at hotStart lands only in the
      // live gap query.
      expect(historicalCall?.[0].query).toContain(
        "AND start_time < {toTimestamp: DateTime64(3)}",
      );
      expect(historicalCall?.[0].params).toMatchObject({
        fromTimestamp: WINDOW_START_CLICKHOUSE,
      });
      expect(gapCall?.[0].query).toContain(
        "AND start_time <= {toTimestamp: DateTime64(3)}",
      );
      expect(gapCall?.[0].params).toMatchObject({
        fromTimestamp: HOT_START_CLICKHOUSE,
        toTimestamp: RECENT_CUTOFF_CLICKHOUSE,
      });
      // Both events_core SELECTs opt into the ClickHouse query cache; the
      // minute-aligned cutoff keeps their AST identical within a minute.
      for (const [args] of eventsCoreCalls) {
        expect(args.clickhouseSettings).toEqual({
          use_query_cache: 1,
          query_cache_ttl: 300,
        });
      }

      // Only the historical slice is cached (1h TTL); the gap stays live.
      await expect(readRedisJson(sdkUsageCacheKey)).resolves.toMatchObject({
        version: 1,
        hotStart: HOT_START_ISO,
        series: [expect.objectContaining({ eventCount: 5 })],
      });
      expect(await readRedisTtl(sdkUsageCacheKey)).toBeGreaterThan(55 * 60);
      expect(await readRedisTtl(sdkUsageCacheKey)).toBeLessThanOrEqual(60 * 60);
      // Experiment POST is Redis-only from the worker; the request path must
      // not shadow-write empty entries on miss.
      await expect(
        readRedisJson(experimentPostUsageCacheKey),
      ).resolves.toBeNull();
    });

    it("serves cached SDK history with a live gap query on cache hit", async () => {
      await seedRedisCache({
        [sdkUsageCacheKey]: sdkUsageBlob([cachedSdkSeries()]),
        [experimentPostUsageCacheKey]: experimentPostBlob(false),
      });
      mockedQueryClickhouse.mockResolvedValue([
        mockSdkUsageRow({
          projectId,
          sdkName: "python",
          sdkVersion: "3.9.0",
          publicKey: "pk-lf-python",
          eventCount: "2",
          firstSeen: "2026-06-25T00:05:00Z",
          lastSeen: "2026-06-25T00:15:00Z",
        }),
      ]);
      const caller = createCaller();

      const summary = await caller.sdkUsageSummary({
        projectId,
      });

      expect(summary.sdkUsageSeries).toEqual([
        expect.objectContaining({
          sdkVersion: "3.9.0",
          eventCount: 7,
          firstSeen: "2026-06-20T01:00:00Z",
          lastSeen: "2026-06-25T00:15:00Z",
        }),
      ]);
      // Cached experiment usage: not_required without a query_log scan.
      expect(summary.experimentInstrumentationMigration).toEqual({
        status: "not_required",
        upgradePath: null,
      });

      // Exactly one ClickHouse query: the live gap on events_core.
      expect(mockedQueryClickhouse).toHaveBeenCalledTimes(1);
      expect(mockedQueryClickhouse.mock.calls[0]?.[0].query).toContain(
        "FROM events_core",
      );
      expect(mockedQueryClickhouse.mock.calls[0]?.[0].params).toMatchObject({
        fromTimestamp: HOT_START_CLICKHOUSE,
        toTimestamp: RECENT_CUTOFF_CLICKHOUSE,
      });
      // Cache hit must not rewrite the historical blob.
      await expect(readRedisJson(sdkUsageCacheKey)).resolves.toMatchObject({
        hotStart: HOT_START_ISO,
        series: [expect.objectContaining({ eventCount: 5 })],
      });
    });

    it("drops cached SDK series that aged out of the 3-day window", async () => {
      await seedRedisCache({
        [sdkUsageCacheKey]: sdkUsageBlob([
          cachedSdkSeries(),
          cachedSdkSeries({
            sdkVersion: "2.0.0",
            // Older than now - 3d (2026-06-22T00:30Z): trimmed at read time.
            firstSeen: "2026-06-20T00:00:00Z",
            lastSeen: "2026-06-21T00:00:00Z",
          }),
        ]),
        [experimentPostUsageCacheKey]: experimentPostBlob(false),
      });
      mockedQueryClickhouse.mockResolvedValue([]);
      const caller = createCaller();

      const summary = await caller.sdkUsageSummary({
        projectId,
      });

      expect(summary.sdkUsageSeries).toEqual([
        expect.objectContaining({ sdkVersion: "3.9.0" }),
      ]);
    });

    it("treats blobs with corrupt JSON as cache misses", async () => {
      await seedRedisCache({
        [sdkUsageCacheKey]: "not-json",
        [experimentPostUsageCacheKey]: experimentPostBlob(false),
      });
      mockedQueryClickhouse.mockResolvedValue([]);
      const caller = createCaller();

      await caller.sdkUsageSummary({
        projectId,
      });

      // Historical refill plus live gap, both against events_core.
      const eventsCoreCalls = mockedQueryClickhouse.mock.calls.filter(
        ([args]) => args.query.includes("FROM events_core"),
      );
      expect(eventsCoreCalls).toHaveLength(2);
      await expect(readRedisJson(sdkUsageCacheKey)).resolves.toMatchObject({
        version: 1,
        hotStart: HOT_START_ISO,
      });
    });

    it("serves legacy API usage from the cache without querying ClickHouse", async () => {
      await seedRedisCache({
        [legacyApiUsageCacheKey]: legacyApiBlob([
          {
            entrypoint: "publicapi: GET /api/public/traces",
            count: 4,
            lastSeen: "2026-06-24T12:00:00.000000Z",
          },
          {
            // Aged out of the window: trimmed at read time.
            entrypoint: "publicapi: GET /api/public/sessions",
            count: 2,
            lastSeen: "2026-06-10T00:00:00.000000Z",
          },
        ]),
      });
      const caller = createCaller();

      const rows = await caller.legacyApiUsageSummary({
        projectId,
      });

      expect(rows).toEqual([
        {
          projectId,
          entrypoint: "publicapi: GET /api/public/traces",
          count: 4,
          lastSeen: "2026-06-24T12:00:00.000000Z",
        },
      ]);
      expect(mockedQueryClickhouse).not.toHaveBeenCalled();
    });

    it("does not query or shadow-write legacy API Redis entries on miss", async () => {
      await seedRedisCache();
      const mockPrisma = {
        project: {
          findMany: vi.fn().mockResolvedValue([
            { id: projectId, name: "V4 Transition Project" },
            { id: secondProjectId, name: "Second Project" },
          ]),
        },
      };
      const caller = createCaller(mockPrisma);

      await expect(
        caller.legacyApiUsageSummaryByProject({
          orgId,
        }),
      ).resolves.toEqual([]);
      expect(mockedQueryClickhouse).not.toHaveBeenCalled();
      await expect(readRedisJson(legacyApiUsageCacheKey)).resolves.toBeNull();
      await expect(
        readRedisJson(`langfuse:v4:legacy-api-usage:v1:${secondProjectId}`),
      ).resolves.toBeNull();
    });

    describe("worker pipeline heartbeat", () => {
      it("serves experiment POST Redis data even when the heartbeat is stale", async () => {
        await seedRedisCache({
          [legacyApiUsageHeartbeatKey]: "2026-06-24T20:30:00.000Z",
          [sdkUsageCacheKey]: sdkUsageBlob([cachedSdkSeries()]),
          [experimentPostUsageCacheKey]: experimentPostBlob(true),
        });
        mockedQueryClickhouse.mockResolvedValue([]);
        const caller = createCaller();

        const summary = await caller.sdkUsageSummary({
          projectId,
        });
        // python 3.9.0 + POST usage → inconclusive (needs current experiment SDK).
        expect(summary.experimentInstrumentationMigration).toEqual({
          status: "sdk_usage_inconclusive",
          upgradePath: "sdk",
        });
        expect(
          mockedQueryClickhouse.mock.calls.some(([args]) =>
            args.query.includes("system.query_log"),
          ),
        ).toBe(false);
      });

      it("treats missing entries as no usage while the heartbeat is fresh", async () => {
        await seedRedisCache({
          // Worker ran 30 minutes ago; it only writes entries for projects
          // WITH usage, so absence is authoritative.
          [legacyApiUsageHeartbeatKey]: "2026-06-25T00:00:00.000Z",
          [sdkUsageCacheKey]: sdkUsageBlob([cachedSdkSeries()]),
        });
        mockedQueryClickhouse.mockResolvedValue([]);
        const caller = createCaller();

        await expect(
          caller.legacyApiUsageSummary({
            projectId,
          }),
        ).resolves.toEqual([]);
        expect(mockedQueryClickhouse).not.toHaveBeenCalled();
        // The request path must not shadow the worker's entries either.
        await expect(readRedisJson(legacyApiUsageCacheKey)).resolves.toBeNull();

        const summary = await caller.sdkUsageSummary({
          projectId,
        });
        expect(summary.experimentInstrumentationMigration).toEqual({
          status: "not_required",
          upgradePath: null,
        });
        // Only the SDK live-gap query on events_core; no query_log scan.
        expect(mockedQueryClickhouse).toHaveBeenCalledTimes(1);
        expect(mockedQueryClickhouse.mock.calls[0]?.[0].query).toContain(
          "FROM events_core",
        );
      });

      it("serves legacy API Redis data even when the heartbeat is stale", async () => {
        await seedRedisCache({
          // 4h old: past the 3h freshness horizon — still serve Redis, no CH.
          [legacyApiUsageHeartbeatKey]: "2026-06-24T20:30:00.000Z",
          [legacyApiUsageCacheKey]: legacyApiBlob([
            {
              entrypoint: "publicapi: GET /api/public/traces",
              count: 4,
              lastSeen: "2026-06-24T12:00:00.000000Z",
            },
          ]),
        });
        const caller = createCaller();

        const rows = await caller.legacyApiUsageSummary({
          projectId,
        });

        expect(rows).toEqual([
          {
            projectId,
            entrypoint: "publicapi: GET /api/public/traces",
            count: 4,
            lastSeen: "2026-06-24T12:00:00.000000Z",
          },
        ]);
        expect(mockedQueryClickhouse).not.toHaveBeenCalled();
      });
    });

    describe("migrationActions", () => {
      const mockPrismaForActions = ({
        evalCount = 0,
      }: { evalCount?: number } = {}) => ({
        evaluationRule: {
          groupBy: vi
            .fn()
            .mockResolvedValue(
              evalCount > 0 ? [{ projectId, _count: { _all: evalCount } }] : [],
            ),
        },
        posthogIntegration: { findMany: vi.fn().mockResolvedValue([]) },
        mixpanelIntegration: { findMany: vi.fn().mockResolvedValue([]) },
        blobStorageIntegration: { findMany: vi.fn().mockResolvedValue([]) },
      });

      it("on cold cache, runs history+gap queries, writes back, and derives the SDK flag", async () => {
        await seedRedisCache();
        mockedQueryClickhouse.mockImplementation(async (args) => {
          if (!args.query.includes("FROM events_core")) return [];
          return (args.params?.toTimestamp as string) === HOT_START_CLICKHOUSE
            ? [
                mockSdkUsageRow({
                  projectId,
                  sdkName: "python",
                  sdkVersion: "3.9.0",
                  publicKey: "pk-lf-python",
                  eventCount: "5",
                  firstSeen: "2026-06-20T01:00:00Z",
                  lastSeen: "2026-06-24T10:00:00Z",
                }),
              ]
            : [];
        });
        const caller = createCaller(mockPrismaForActions());

        await expect(caller.migrationActions({ projectId })).resolves.toEqual({
          forceV3Experience: false,
          sdkActionNeeded: true,
          experimentsActionNeeded: null,
          apisActionNeeded: null,
          evalsActionNeeded: false,
          exportsActionNeeded: false,
        });

        const eventsCoreCalls = mockedQueryClickhouse.mock.calls.filter(
          ([args]) => args.query.includes("FROM events_core"),
        );
        expect(eventsCoreCalls).toHaveLength(2);
        await expect(readRedisJson(sdkUsageCacheKey)).resolves.toMatchObject({
          version: 1,
          hotStart: HOT_START_ISO,
          series: [expect.objectContaining({ eventCount: 5 })],
        });
        await expect(readRedisJson(legacyApiUsageCacheKey)).resolves.toBeNull();
        await expect(
          readRedisJson(experimentPostUsageCacheKey),
        ).resolves.toBeNull();
      });

      it("on cache hit, runs the live gap query and merges for the SDK flag", async () => {
        await seedRedisCache({
          [sdkUsageCacheKey]: sdkUsageBlob([
            cachedSdkSeries({ actionLevel: "required" }),
          ]),
          [experimentPostUsageCacheKey]: experimentPostBlob(false),
          [legacyApiUsageCacheKey]: legacyApiBlob([]),
        });
        mockedQueryClickhouse.mockImplementation(async (args) => {
          if (!args.query.includes("FROM events_core")) return [];
          return [];
        });
        const caller = createCaller(mockPrismaForActions({ evalCount: 2 }));

        await expect(caller.migrationActions({ projectId })).resolves.toEqual({
          forceV3Experience: false,
          sdkActionNeeded: true,
          experimentsActionNeeded: false,
          apisActionNeeded: false,
          evalsActionNeeded: true,
          exportsActionNeeded: false,
        });

        const eventsCoreCalls = mockedQueryClickhouse.mock.calls.filter(
          ([args]) => args.query.includes("FROM events_core"),
        );
        expect(eventsCoreCalls).toHaveLength(1);
        expect(eventsCoreCalls[0]?.[0].params).toMatchObject({
          fromTimestamp: HOT_START_CLICKHOUSE,
          toTimestamp: RECENT_CUTOFF_CLICKHOUSE,
        });
        // Cache hit must not rewrite the historical SDK blob.
        await expect(readRedisJson(sdkUsageCacheKey)).resolves.toMatchObject({
          hotStart: HOT_START_ISO,
          series: [expect.objectContaining({ eventCount: 5 })],
        });
      });

      it.each(["Claude Code/1.0", "codex-cli/1.2.3", "curl/8.7.1"])(
        "does not require an API action for deprecated calls made only by %s",
        async (userAgent) => {
          await seedRedisCache({
            [sdkUsageCacheKey]: sdkUsageBlob([]),
            [experimentPostUsageCacheKey]: experimentPostBlob(false),
            [legacyApiUsageCacheKey]: legacyApiBlob([
              {
                entrypoint: "publicapi: GET /api/public/traces",
                count: 2,
                lastSeen: "2026-06-24T12:00:00.000000Z",
                callers: [
                  {
                    userAgent,
                    count: 2,
                    lastSeen: "2026-06-24T12:00:00.000000Z",
                  },
                ],
              },
            ]),
          });
          mockedQueryClickhouse.mockResolvedValue([]);
          const caller = createCaller(mockPrismaForActions());

          await expect(
            caller.migrationActions({ projectId }),
          ).resolves.toMatchObject({
            sdkActionNeeded: false,
            experimentsActionNeeded: false,
            apisActionNeeded: false,
            evalsActionNeeded: false,
            exportsActionNeeded: false,
          });
        },
      );

      it("keeps the API action when any caller is not an agent or curl", async () => {
        await seedRedisCache({
          [sdkUsageCacheKey]: sdkUsageBlob([]),
          [experimentPostUsageCacheKey]: experimentPostBlob(false),
          [legacyApiUsageCacheKey]: legacyApiBlob([
            {
              entrypoint: "publicapi: GET /api/public/traces",
              count: 3,
              lastSeen: "2026-06-24T12:00:00.000000Z",
              callers: [
                {
                  userAgent: "codex-cli/1.2.3",
                  count: 2,
                  lastSeen: "2026-06-24T12:00:00.000000Z",
                },
                {
                  userAgent: "langfuse-python/3.9.0",
                  count: 1,
                  lastSeen: "2026-06-24T11:00:00.000000Z",
                },
              ],
            },
          ]),
        });
        mockedQueryClickhouse.mockResolvedValue([]);
        const caller = createCaller(mockPrismaForActions());

        await expect(
          caller.migrationActions({ projectId }),
        ).resolves.toMatchObject({
          apisActionNeeded: true,
        });
      });

      it("keeps the API action for an aggregated unknown caller", async () => {
        await seedRedisCache({
          [sdkUsageCacheKey]: sdkUsageBlob([]),
          [experimentPostUsageCacheKey]: experimentPostBlob(false),
          [legacyApiUsageCacheKey]: legacyApiBlob([
            {
              entrypoint: "publicapi: GET /api/public/traces",
              count: 2,
              lastSeen: "2026-06-24T12:00:00.000000Z",
              callers: [
                {
                  isOther: true,
                  count: 2,
                  lastSeen: "2026-06-24T12:00:00.000000Z",
                },
              ],
            },
          ]),
        });
        mockedQueryClickhouse.mockResolvedValue([]);
        const caller = createCaller(mockPrismaForActions());

        await expect(
          caller.migrationActions({ projectId }),
        ).resolves.toMatchObject({
          apisActionNeeded: true,
        });
      });

      it("short-circuits partner-managed (forced v3) projects without any I/O", async () => {
        await seedRedisCache();
        sharedServerMock.isForceV3ExperienceProject.mockReturnValueOnce(true);
        const prismaMock = mockPrismaForActions();
        const caller = createCaller(prismaMock);

        await expect(caller.migrationActions({ projectId })).resolves.toEqual({
          forceV3Experience: true,
          sdkActionNeeded: null,
          experimentsActionNeeded: null,
          apisActionNeeded: null,
          evalsActionNeeded: false,
          exportsActionNeeded: false,
        });

        expect(prismaMock.evaluationRule.groupBy).not.toHaveBeenCalled();
        expect(mockedQueryClickhouse).not.toHaveBeenCalled();
      });

      it("when Redis is unavailable, queries the full window and derives the SDK flag", async () => {
        // Default beforeEach leaves the cache gated off (status proxy → "end").
        redisAvailability.available = false;
        mockedQueryClickhouse.mockImplementation(async (args) => {
          if (!args.query.includes("FROM events_core")) return [];
          return [
            mockSdkUsageRow({
              projectId,
              sdkName: "python",
              sdkVersion: "3.9.0",
              publicKey: "pk-lf-python",
              eventCount: "3",
              firstSeen: "2026-06-20T01:00:00Z",
              lastSeen: "2026-06-24T10:00:00Z",
            }),
          ];
        });
        const caller = createCaller(mockPrismaForActions());

        await expect(
          caller.migrationActions({ projectId }),
        ).resolves.toMatchObject({
          sdkActionNeeded: true,
          experimentsActionNeeded: null,
          apisActionNeeded: null,
        });

        const eventsCoreCalls = mockedQueryClickhouse.mock.calls.filter(
          ([args]) => args.query.includes("FROM events_core"),
        );
        expect(eventsCoreCalls).toHaveLength(1);
      });
    });
  });
});
