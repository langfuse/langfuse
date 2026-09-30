import { getOrganizationIngestionOverview } from "@/src/features/organization-ingestion/server/organizationIngestionService";
import { prisma } from "@langfuse/shared/src/db";

const mocks = vi.hoisted(() => ({
  queryClickhouse: vi.fn(),
  getSdkUsageSeriesByProject: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  queryClickhouse: mocks.queryClickhouse,
  logger: { warn: mocks.warn },
  UNKNOWN_INGESTION_SDK_VALUE: "unknown",
  convertDateToClickhouseDateTime: (date: Date) => date.toISOString(),
  classifyIngestionSdkVersion: () => ({
    canonicalSdkName: null,
    status: "unsupported_sdk",
  }),
}));
vi.mock("@/src/features/v4/server/v4TransitionCache", () => ({
  MIGRATION_INGRESS_EVENT_SOURCES: ["otel", "otel-delayed"],
}));
vi.mock("@/src/features/v4/server/v4TransitionSdkUsage", () => ({
  getSdkUsageSeriesByProject: mocks.getSdkUsageSeriesByProject,
}));

const client = {
  projectId: "project",
  sdkName: "custom-client",
  sdkVersion: "1.0.0",
  publicKey: "pk-client",
  isInternal: false,
  currentCount: 10,
  previousCount: 0,
  lastSeen: "2026-09-30T00:00:00Z",
};

describe("organization ingestion migration attributes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(prisma.evaluationRule, "groupBy").mockResolvedValue([]);
    vi.spyOn(prisma.dataset, "groupBy").mockResolvedValue([]);
    vi.spyOn(prisma.datasetItem, "groupBy").mockResolvedValue([]);
    vi.spyOn(prisma.monitor, "groupBy").mockResolvedValue([]);
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([]);
    mocks.queryClickhouse
      .mockResolvedValueOnce([{ ...client, ingestionPath: "otel" }])
      .mockResolvedValueOnce([{ ...client, source: "API" }]);
  });

  it.each([
    { actions: ["none"], expected: "not_required" },
    { actions: ["none", "required"], expected: "required" },
    { actions: ["required", "none"], expected: "required" },
    { actions: [], expected: "unknown" },
  ])(
    "maps $actions to $expected for events and scores",
    async ({ actions, expected }) => {
      mocks.getSdkUsageSeriesByProject.mockResolvedValue(
        new Map([
          [
            "project",
            actions.map((actionLevel) => ({ ...client, actionLevel })),
          ],
        ]),
      );
      const result = await getOrganizationIngestionOverview({
        prisma,
        projects: [{ id: "project", name: "Project" }],
        nowMs: Date.parse("2026-09-30T12:00:00Z"),
      });
      expect(result.eventRows[0]?.v4Migration).toBe(expected);
      expect(result.scoreRows[0]?.v4Migration).toBe(expected);
    },
  );

  it("does not query migration evidence for an empty organization", async () => {
    await getOrganizationIngestionOverview({ prisma, projects: [] });
    expect(mocks.getSdkUsageSeriesByProject).not.toHaveBeenCalled();
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
  });

  it("preserves analytics when migration evidence fails", async () => {
    const error = new Error("SDK usage query timed out");
    mocks.getSdkUsageSeriesByProject.mockRejectedValue(error);

    const result = await getOrganizationIngestionOverview({
      prisma,
      projects: [{ id: "project", name: "Project" }],
      nowMs: Date.parse("2026-09-30T12:00:00Z"),
    });

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.features.datasets).toBe(0);
    expect(result.eventRows[0]).toMatchObject({
      current: 10,
      v4Migration: "unknown",
    });
    expect(result.scoreRows[0]).toMatchObject({
      current: 10,
      v4Migration: "unknown",
    });
    expect(mocks.warn).toHaveBeenCalledWith(
      "Failed to load organization ingestion migration status",
      { error },
    );
  });
});
