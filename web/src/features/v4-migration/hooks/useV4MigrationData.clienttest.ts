import { renderHook } from "@testing-library/react";
import { vi } from "vitest";

import { useAccountV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";

const mocks = vi.hoisted(() => ({
  summaryByProject: vi.fn(),
  traceLevelEvalSummaryByProject: vi.fn(),
  legacyApiUsageSummaryByProject: vi.fn(),
  sdkUsageSummaryByProject: vi.fn(),
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
  },
}));

const loadedQuery = <T>(data: T) => ({
  data,
  isError: false,
});

const currentSdkSeries = {
  sdkName: "python",
  sdkVersion: "4.7.0",
  canonicalSdkName: "python" as const,
  publicKey: "pk-lf-python",
  count: 1,
  firstSeen: "2026-07-23T09:00:00Z",
  lastSeen: "2026-07-23T10:00:00Z",
  hasDelayedOtelEvents: true,
  attributionStatus: "attributed" as const,
  v4MigrationStatus: "compatible" as const,
  upgradeCompleted: false,
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
            outdatedSdkUsageSeriesCount: 0,
            delayedOtelIngestionSeriesCount: 0,
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
          },
          {
            projectId: "project-1",
            entrypoint: "publicapi: GET /api/public/sessions",
            count: 2,
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
      apis: { status: "loaded", count: 2 },
      exports: { status: "loaded", count: 1 },
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
});
