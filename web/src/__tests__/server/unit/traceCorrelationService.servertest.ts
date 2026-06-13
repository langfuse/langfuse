import type { Session } from "next-auth";

const repositoryMocks = vi.hoisted(() => ({
  getRelatedTracesByMetadataCorrelation: vi.fn(),
  getRelatedTracesByMetadataCorrelationFromEventsTable: vi.fn(),
  getTraceById: vi.fn(),
  getTraceByIdFromEventsTable: vi.fn(),
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
  redis: null,
  logger: {
    debug: vi.fn(),
  },
  ClickHouseClientManager: {
    getInstance: vi.fn(() => ({
      closeAllConnections: vi.fn(),
    })),
  },
}));

vi.mock("@langfuse/shared/src/server", () => repositoryMocks);

import {
  buildTraceCorrelationTimeWindow,
  getRelatedTracesAcrossProjects,
} from "@/src/features/trace-correlation/server/traceCorrelationService";

const sourceProjectId = "project-source";
const orgId = "org-1";
const traceId = "trace-1";
const correlationKey = "crossProjectCorrelationId";
const correlationValue = "workflow-1";
const timestamp = new Date("2026-01-01T12:00:00.000Z");

const createSession = ({
  admin = false,
  projects = [
    { id: sourceProjectId, role: "ADMIN" as const },
    { id: "project-readable", role: "VIEWER" as const },
  ],
}: {
  admin?: boolean;
  projects?: Array<{ id: string; role: "ADMIN" | "VIEWER" | "NONE" }>;
} = {}): Session => ({
  expires: "2026-01-01T00:00:00.000Z",
  user: {
    id: "user-1",
    name: "User",
    email: "user@example.com",
    canCreateOrganizations: true,
    admin,
    organizations: [
      {
        id: orgId,
        name: "Org",
        role: "OWNER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: true,
        crossProjectTraceTrackingEnabled: true,
        crossProjectTraceCorrelationKey: correlationKey,
        projects: projects.map((project) => ({
          id: project.id,
          name: project.id,
          role: project.role,
          retentionDays: 30,
          deletedAt: null,
          hasTraces: true,
          metadata: {},
          createdAt: "2026-01-01T00:00:00.000Z",
        })),
      },
    ],
    featureFlags: {
      excludeClickhouseRead: false,
      templateFlag: true,
    },
  },
  environment: {
    enableExperimentalFeatures: false,
    selfHostedInstancePlan: null,
  },
});

const createPrisma = ({
  enabled = true,
  storedCorrelationKey = correlationKey,
  projects = [{ id: "project-readable", name: "Readable Project" }],
}: {
  enabled?: boolean;
  storedCorrelationKey?: string;
  projects?: Array<{ id: string; name: string }>;
} = {}) =>
  ({
    organization: {
      findUnique: vi.fn().mockResolvedValue({
        crossProjectTraceTrackingEnabled: enabled,
        crossProjectTraceCorrelationKey: storedCorrelationKey,
      }),
    },
    project: {
      findMany: vi.fn().mockResolvedValue(projects),
    },
  }) as any;

describe("traceCorrelationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMocks.getTraceById.mockResolvedValue({
      timestamp,
      metadata: { [correlationKey]: correlationValue },
    });
    repositoryMocks.getTraceByIdFromEventsTable.mockResolvedValue({
      timestamp,
      metadata: { [correlationKey]: correlationValue },
    });
    repositoryMocks.getRelatedTracesByMetadataCorrelation.mockResolvedValue([]);
    repositoryMocks.getRelatedTracesByMetadataCorrelationFromEventsTable.mockResolvedValue(
      [],
    );
  });

  it("returns disabled without querying ClickHouse when the org setting is off", async () => {
    const prisma = createPrisma({ enabled: false });

    const result = await getRelatedTracesAcrossProjects({
      prisma,
      session: createSession(),
      sourceOrgId: orgId,
      sourceProjectId,
      traceId,
      timestamp,
      source: "traces",
    });

    expect(result).toEqual({
      enabled: false,
      related: [],
      truncated: false,
      correlationKey: null,
      correlationStatus: "disabled",
    });
    expect(repositoryMocks.getTraceById).not.toHaveBeenCalled();
    expect(
      repositoryMocks.getRelatedTracesByMetadataCorrelation,
    ).not.toHaveBeenCalled();
  });

  it("looks up only readable sibling projects and shapes navigation links", async () => {
    const prisma = createPrisma({
      projects: [{ id: "project-readable", name: "Readable Project" }],
    });
    repositoryMocks.getRelatedTracesByMetadataCorrelation.mockResolvedValue([
      {
        projectId: "project-readable",
        projectName: "Readable Project",
        traceId,
        traceName: "Sibling trace",
        timestamp,
        source: "traces",
      },
      {
        projectId: "project-hidden",
        projectName: "Hidden Project",
        traceId,
        traceName: "Hidden trace",
        timestamp,
        source: "traces",
      },
    ]);

    const result = await getRelatedTracesAcrossProjects({
      prisma,
      session: createSession({
        projects: [
          { id: sourceProjectId, role: "ADMIN" },
          { id: "project-readable", role: "VIEWER" },
          { id: "project-hidden", role: "NONE" },
        ],
      }),
      sourceOrgId: orgId,
      sourceProjectId,
      traceId,
      minStartTime: new Date("2026-01-01T11:30:00.000Z"),
      maxStartTime: new Date("2026-01-01T12:30:00.000Z"),
      timestamp,
      source: "traces",
    });

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: expect.objectContaining({
            in: ["project-readable"],
            not: sourceProjectId,
          }),
        }),
      }),
    );
    expect(
      repositoryMocks.getRelatedTracesByMetadataCorrelation,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        projectIds: ["project-readable"],
        correlationKey,
        correlationValue,
      }),
    );
    expect(result).toEqual({
      enabled: true,
      truncated: false,
      correlationKey,
      correlationStatus: "matched",
      related: [
        {
          projectId: "project-readable",
          projectName: "Readable Project",
          traceId,
          traceName: "Sibling trace",
          timestamp,
          htmlPath:
            "/project/project-readable/traces/trace-1?timestamp=2026-01-01T12%3A00%3A00.000Z",
          source: "traces",
        },
      ],
    });
  });

  it("uses the events backend for v4 trace correlation", async () => {
    const prisma = createPrisma();

    await getRelatedTracesAcrossProjects({
      prisma,
      session: createSession(),
      sourceOrgId: orgId,
      sourceProjectId,
      traceId,
      timestamp,
      source: "events_core",
    });

    expect(repositoryMocks.getTraceByIdFromEventsTable).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: sourceProjectId,
        traceId,
      }),
    );
    expect(
      repositoryMocks.getRelatedTracesByMetadataCorrelationFromEventsTable,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        projectIds: ["project-readable"],
        correlationKey,
        correlationValue,
      }),
    );
    expect(repositoryMocks.getTraceById).not.toHaveBeenCalled();
  });

  it("does not query sibling projects when the source trace lacks the correlation metadata", async () => {
    const prisma = createPrisma();
    repositoryMocks.getTraceById.mockResolvedValue({
      timestamp,
      metadata: {},
    });

    const result = await getRelatedTracesAcrossProjects({
      prisma,
      session: createSession(),
      sourceOrgId: orgId,
      sourceProjectId,
      traceId,
      timestamp,
      source: "traces",
    });

    expect(result).toEqual({
      enabled: true,
      related: [],
      truncated: false,
      correlationKey,
      correlationStatus: "missing",
    });
    expect(
      repositoryMocks.getRelatedTracesByMetadataCorrelation,
    ).not.toHaveBeenCalled();
  });

  it("caps related traces at 50 and marks truncated", async () => {
    const projects = Array.from({ length: 51 }, (_, index) => ({
      id: `project-${index}`,
      name: `Project ${index}`,
    }));
    const prisma = createPrisma({ projects });
    repositoryMocks.getRelatedTracesByMetadataCorrelation.mockResolvedValue(
      projects.map((project) => ({
        projectId: project.id,
        traceId,
        traceName: project.name,
        timestamp,
        source: "traces",
      })),
    );

    const result = await getRelatedTracesAcrossProjects({
      prisma,
      session: createSession({ admin: true }),
      sourceOrgId: orgId,
      sourceProjectId,
      traceId,
      timestamp,
      source: "traces",
    });

    expect(result.related).toHaveLength(50);
    expect(result.truncated).toBe(true);
  });

  it("chunks large project fanout and sorts records across chunks", async () => {
    const projects = Array.from({ length: 251 }, (_, index) => ({
      id: `project-${index}`,
      name: `Project ${index}`,
    }));
    const prisma = createPrisma({ projects });
    repositoryMocks.getRelatedTracesByMetadataCorrelation.mockImplementation(
      async ({ projectIds }: { projectIds: string[] }) => {
        if (projectIds.includes("project-0")) {
          return [
            {
              projectId: "project-0",
              traceId,
              traceName: "Later trace",
              timestamp: new Date("2026-01-01T12:05:00.000Z"),
              source: "traces",
            },
          ];
        }

        if (projectIds.includes("project-250")) {
          return [
            {
              projectId: "project-250",
              traceId,
              traceName: "Earlier trace",
              timestamp: new Date("2026-01-01T12:00:00.000Z"),
              source: "traces",
            },
          ];
        }

        return [];
      },
    );

    const result = await getRelatedTracesAcrossProjects({
      prisma,
      session: createSession({ admin: true }),
      sourceOrgId: orgId,
      sourceProjectId,
      traceId,
      timestamp,
      source: "traces",
    });

    expect(
      repositoryMocks.getRelatedTracesByMetadataCorrelation,
    ).toHaveBeenCalledTimes(2);
    expect(
      repositoryMocks.getRelatedTracesByMetadataCorrelation.mock.calls.map(
        ([call]) => call.projectIds.length,
      ),
    ).toEqual([250, 1]);
    expect(result.related.map((trace) => trace.projectId)).toEqual([
      "project-250",
      "project-0",
    ]);
  });

  it("caps the derived time window to 24 hours", () => {
    const { fromTimestamp, toTimestamp } = buildTraceCorrelationTimeWindow({
      minStartTime: new Date("2026-01-01T00:00:00.000Z"),
      maxStartTime: new Date("2026-01-03T00:00:00.000Z"),
      fallbackTimestamp: timestamp,
    });

    expect(toTimestamp.getTime() - fromTimestamp.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });
});
