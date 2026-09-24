import { renderHook } from "@testing-library/react";
import { vi } from "vitest";

import {
  useAccountV4MigrationData,
  useProjectV4MigrationData,
  useProjectV4MigrationActions,
} from "@/src/features/v4-migration/hooks/useV4MigrationData";

const mocks = vi.hoisted(() => ({
  summaryByProject: vi.fn(),
  traceLevelEvalSummaryByProject: vi.fn(),
  legacyApiUsageSummaryByProject: vi.fn(),
  sdkUsageSummaryByProject: vi.fn(),
  summaryUseQuery: vi.fn(),
  traceLevelEvalSummaryUseQuery: vi.fn(),
  legacyApiUsageSummaryUseQuery: vi.fn(),
  sdkUsageSummaryUseQuery: vi.fn(),
  migrationActionsUseQuery: vi.fn(),
  queryResultSets: [] as unknown[][],
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useQueries: (
      buildQueries: (router: {
        v4Transition: {
          summaryByProject: typeof mocks.summaryByProject;
          traceLevelEvalSummaryByProject: typeof mocks.traceLevelEvalSummaryByProject;
          legacyApiUsageSummaryByProject: typeof mocks.legacyApiUsageSummaryByProject;
          sdkUsageSummaryByProject: typeof mocks.sdkUsageSummaryByProject;
        };
      }) => unknown,
    ) => {
      buildQueries({
        v4Transition: {
          summaryByProject: mocks.summaryByProject,
          traceLevelEvalSummaryByProject: mocks.traceLevelEvalSummaryByProject,
          legacyApiUsageSummaryByProject: mocks.legacyApiUsageSummaryByProject,
          sdkUsageSummaryByProject: mocks.sdkUsageSummaryByProject,
        },
      });
      return mocks.queryResultSets.shift() ?? [];
    },
    v4Transition: {
      summary: {
        useQuery: (...args: unknown[]) => mocks.summaryUseQuery(...args),
      },
      traceLevelEvalSummary: {
        useQuery: (...args: unknown[]) =>
          mocks.traceLevelEvalSummaryUseQuery(...args),
      },
      legacyApiUsageSummary: {
        useQuery: (...args: unknown[]) =>
          mocks.legacyApiUsageSummaryUseQuery(...args),
      },
      sdkUsageSummary: {
        useQuery: (...args: unknown[]) =>
          mocks.sdkUsageSummaryUseQuery(...args),
      },
      migrationActions: {
        useQuery: (...args: unknown[]) =>
          mocks.migrationActionsUseQuery(...args),
      },
    },
  },
}));

vi.mock("@/src/features/v4-migration/useForceV3Experience", () => ({
  useForceV3Experience: () => false,
}));

const loadedQuery = <T>(data: T) => ({
  data,
  isError: false,
});

const currentSdkSeries = {
  source: "ingestion-api-dual-write" as const,
  ingestionPath: "ingestion_api" as const,
  deliveryMode: "delayed" as const,
  sdkName: "python",
  sdkVersion: "4.7.0",
  canonicalSdkName: "python" as const,
  sdkVersionMajor: 4,
  latestSdkMajor: 4,
  isValidSdkVersion: true,
  publicKey: "pk-lf-python",
  eventCount: 1,
  firstSeen: "2026-07-23T09:00:00Z",
  lastSeen: "2026-07-23T10:00:00Z",
  attributionStatus: "attributed" as const,
  v4MigrationStatus: "compatible" as const,
  remediationType: "update_sdk" as const,
  actionLevel: "none" as const,
};

describe("account v4 migration data", () => {
  beforeEach(() => {
    mocks.summaryByProject.mockReset();
    mocks.traceLevelEvalSummaryByProject.mockReset();
    mocks.legacyApiUsageSummaryByProject.mockReset();
    mocks.sdkUsageSummaryByProject.mockReset();
    mocks.queryResultSets = [
      [
        loadedQuery({
          projects: [
            {
              projectId: "project-1",
              projectName: "Project",
              legacyIntegrationCount: 1,
              legacyIntegrations: {
                posthog: true,
                mixpanel: false,
                blobStorage: false,
              },
            },
          ],
        }),
      ],
      [
        loadedQuery([
          {
            projectId: "project-1",
            traceLevelEvalCount: 2,
          },
        ]),
      ],
      [
        loadedQuery([
          {
            projectId: "project-1",
            experimentInstrumentationMigration: {
              status: "sdk_usage_inconclusive" as const,
              upgradePath: "sdk" as const,
            },
            sdkUsageSeries: [currentSdkSeries],
          },
        ]),
      ],
      [
        loadedQuery([
          {
            projectId: "project-1",
            entrypoint: "publicapi: GET /api/public/traces",
            count: 4,
            lastSeen: "2026-07-23T10:00:00Z",
          },
          {
            projectId: "project-1",
            entrypoint: "publicapi: GET /api/public/sessions",
            count: 2,
            lastSeen: "2026-07-23T09:30:00Z",
          },
        ]),
      ],
    ];
  });

  it("combines the real organization summaries by project", () => {
    const { result } = renderHook(() =>
      useAccountV4MigrationData({
        organizations: [
          {
            id: "org-1",
            name: "Organization",
            projects: [{ id: "project-1", name: "Project" }],
          },
        ],
        enabled: true,
      }),
    );

    expect(result.current.get("project-1")).toEqual({
      sdk: {
        status: "latest",
        sdkUsageSeries: [currentSdkSeries],
        upgradeRequiredCount: 0,
        delayedOtelIngestionCount: 0,
      },
      evals: { status: "loaded", count: 2 },
      experiments: {
        status: "loaded",
        result: "sdk_usage_inconclusive",
      },
      apis: { status: "loaded", count: 2 },
      exports: { status: "loaded", count: 1 },
      forceV3Experience: false,
    });
    expect(mocks.summaryByProject).toHaveBeenCalledWith(
      { orgId: "org-1" },
      expect.objectContaining({ enabled: true }),
    );
    expect(mocks.legacyApiUsageSummaryByProject).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-1" }),
      expect.objectContaining({ enabled: true }),
    );
    expect(mocks.sdkUsageSummaryByProject).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-1" }),
      expect.objectContaining({ enabled: true }),
    );
  });

  it("marks projects forced onto the v3 experience as partner-managed", () => {
    const [integrationResultSet] = mocks.queryResultSets as [
      [{ data: { projects: Record<string, unknown>[] } }],
      ...unknown[][],
    ];
    integrationResultSet[0].data.projects[0].forceV3Experience = true;

    const { result } = renderHook(() =>
      useAccountV4MigrationData({
        organizations: [
          {
            id: "org-1",
            name: "Organization",
            projects: [{ id: "project-1", name: "Project" }],
          },
        ],
        enabled: true,
      }),
    );

    expect(result.current.get("project-1")).toMatchObject({
      forceV3Experience: true,
    });
  });

  it("excludes agent-only deprecated API usage from organization readiness", () => {
    const apiResultSet = mocks.queryResultSets[3] as [
      { data: Array<Record<string, unknown>> },
    ];
    apiResultSet[0].data = [
      {
        projectId: "project-1",
        entrypoint: "publicapi: GET /api/public/traces",
        count: 4,
        lastSeen: "2026-07-23T10:00:00Z",
        callers: [
          {
            userAgent: "codex-cli/1.2.3",
            count: 4,
            lastSeen: "2026-07-23T10:00:00Z",
          },
        ],
      },
    ];

    const { result } = renderHook(() =>
      useAccountV4MigrationData({
        organizations: [
          {
            id: "org-1",
            name: "Organization",
            projects: [{ id: "project-1", name: "Project" }],
          },
        ],
        enabled: true,
      }),
    );

    expect(result.current.get("project-1")?.apis).toEqual({
      status: "loaded",
      count: 0,
    });
  });
});

describe("project v4 migration data", () => {
  beforeEach(() => {
    mocks.sdkUsageSummaryUseQuery.mockReturnValue(
      loadedQuery({
        experimentInstrumentationMigration: {
          status: "not_required" as const,
          upgradePath: null,
        },
        sdkUsageSeries: [currentSdkSeries],
      }),
    );
    mocks.traceLevelEvalSummaryUseQuery.mockReturnValue(
      loadedQuery({ traceLevelEvalCount: 0 }),
    );
    mocks.legacyApiUsageSummaryUseQuery.mockReturnValue(
      loadedQuery([
        {
          entrypoint: "publicapi: GET /api/public/traces",
          count: 4,
          lastSeen: "2026-07-23T10:00:00Z",
          callers: [
            {
              userAgent: "Claude Code/1.0",
              count: 4,
              lastSeen: "2026-07-23T10:00:00Z",
            },
          ],
        },
      ]),
    );
    mocks.summaryUseQuery.mockReturnValue(
      loadedQuery({
        legacyIntegrationCount: 0,
        legacyIntegrations: {
          posthog: false,
          mixpanel: false,
          blobStorage: false,
        },
      }),
    );
  });

  it("excludes agent-only API usage from readiness but preserves its evidence", () => {
    const { result } = renderHook(() =>
      useProjectV4MigrationData({ projectId: "project-1", enabled: true }),
    );

    expect(result.current.apis).toEqual({ status: "loaded", count: 0 });
    expect(result.current.apiUsage).toHaveLength(1);
  });

  it("orders API routes and their callers by most recent usage", () => {
    mocks.legacyApiUsageSummaryUseQuery.mockReturnValue(
      loadedQuery([
        {
          entrypoint: "publicapi: GET /api/public/sessions",
          count: 2,
          lastSeen: "2026-07-23T09:00:00Z",
          callers: [
            {
              userAgent: "recent-sessions-caller",
              count: 1,
              lastSeen: "2026-07-23T09:00:00Z",
            },
          ],
        },
        {
          entrypoint: "publicapi: GET /api/public/traces",
          count: 11,
          lastSeen: "2026-07-23T11:00:00Z",
          callers: [
            {
              userAgent: "frequent-older-caller",
              count: 10,
              lastSeen: "2026-07-23T10:00:00Z",
            },
            {
              userAgent: "recent-caller",
              count: 1,
              lastSeen: "2026-07-23T11:00:00Z",
            },
          ],
        },
      ]),
    );

    const { result } = renderHook(() =>
      useProjectV4MigrationData({ projectId: "project-1", enabled: true }),
    );

    expect(result.current.apiUsage.map((row) => row.endpoint)).toEqual([
      "GET /api/public/traces",
      "GET /api/public/sessions",
    ]);
    expect(
      result.current.apiUsage[0]?.callers.map((caller) => caller.userAgent),
    ).toEqual(["recent-caller", "frequent-older-caller"]);
  });
});

describe("migration actions", () => {
  const cachedActions = (
    overrides: Partial<{
      forceV3Experience: boolean;
      sdkActionNeeded: boolean | null;
      experimentsActionNeeded: boolean | null;
      apisActionNeeded: boolean | null;
      evalsActionNeeded: boolean;
      exportsActionNeeded: boolean;
    }> = {},
  ) => ({
    forceV3Experience: false,
    sdkActionNeeded: null,
    experimentsActionNeeded: null,
    apisActionNeeded: null,
    evalsActionNeeded: false,
    exportsActionNeeded: false,
    ...overrides,
  });

  beforeEach(() => {
    mocks.migrationActionsUseQuery.mockReset();
  });

  it("reports no action while the query has no data", () => {
    mocks.migrationActionsUseQuery.mockReturnValue({ data: undefined });

    const { result } = renderHook(() =>
      useProjectV4MigrationActions("project-1"),
    );

    expect(result.current).toEqual({ actionNeeded: false });
  });

  it("treats unknown categories as no signal instead of action needed", () => {
    mocks.migrationActionsUseQuery.mockReturnValue({
      data: cachedActions(),
    });

    const { result } = renderHook(() =>
      useProjectV4MigrationActions("project-1"),
    );

    expect(result.current).toEqual({ actionNeeded: false });
  });

  it("needs action when any known category requires it", () => {
    mocks.migrationActionsUseQuery.mockReturnValue({
      data: cachedActions({ sdkActionNeeded: true }),
    });

    const { result } = renderHook(() =>
      useProjectV4MigrationActions("project-1"),
    );

    expect(result.current).toEqual({ actionNeeded: true });
  });

  it("suppresses the signal for partner-managed (forced v3) projects", () => {
    mocks.migrationActionsUseQuery.mockReturnValue({
      data: cachedActions({
        forceV3Experience: true,
        sdkActionNeeded: true,
        evalsActionNeeded: true,
      }),
    });

    const { result } = renderHook(() =>
      useProjectV4MigrationActions("project-1"),
    );

    expect(result.current).toEqual({ actionNeeded: false });
  });
});
