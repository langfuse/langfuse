import { getOrganizationIngestionOverview } from "@/src/features/organization-ingestion/server/organizationIngestionService";

const mocks = vi.hoisted(() => ({
  queryClickhouse: vi.fn(),
  getSdkUsageSeriesByProject: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  queryClickhouse: mocks.queryClickhouse,
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
        projects: [{ id: "project", name: "Project" }],
        nowMs: Date.parse("2026-09-30T12:00:00Z"),
      });
      expect(result.eventRows[0]?.v4Migration).toBe(expected);
      expect(result.scoreRows[0]?.v4Migration).toBe(expected);
    },
  );

  it("does not query migration evidence for an empty organization", async () => {
    await getOrganizationIngestionOverview({ projects: [] });
    expect(mocks.getSdkUsageSeriesByProject).not.toHaveBeenCalled();
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
  });
});
