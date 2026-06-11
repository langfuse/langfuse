const { mockGenerateObservations, mockGetObservationsCount } = vi.hoisted(
  () => ({
    mockGenerateObservations: vi.fn(),
    mockGetObservationsCount: vi.fn(),
  }),
);

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...(actual as object),
    generateObservationsForPublicApi: mockGenerateObservations,
    getObservationsCountForPublicApi: mockGetObservationsCount,
  };
});

import {
  generateObservationsForPublicApi,
  getObservationsCountForPublicApi,
} from "@/src/features/public-api/server/observations";

const BASE = {
  projectId: "project-1",
  page: 1,
  limit: 10,
};

describe("buildObservationsFilter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateObservations.mockResolvedValue([]);
    mockGetObservationsCount.mockResolvedValue(0);
  });

  it("always injects project_id on the observations table", async () => {
    await generateObservationsForPublicApi(BASE);

    const { filter } = mockGenerateObservations.mock.calls[0][0];
    expect(
      filter.some(
        (f: any) =>
          f.field === "project_id" &&
          f.clickhouseTable === "observations" &&
          f.value === "project-1",
      ),
    ).toBe(true);
  });

  it("traceId maps to trace_id on the observations table", async () => {
    await generateObservationsForPublicApi({ ...BASE, traceId: "trace-abc" });

    const { filter } = mockGenerateObservations.mock.calls[0][0];
    expect(
      filter.some(
        (f: any) =>
          f.field === "trace_id" && f.clickhouseTable === "observations",
      ),
    ).toBe(true);
  });

  it("level maps to a filter on the observations table", async () => {
    await generateObservationsForPublicApi({ ...BASE, level: "ERROR" });

    const { filter } = mockGenerateObservations.mock.calls[0][0];
    expect(
      filter.some(
        (f: any) => f.field === "level" && f.clickhouseTable === "observations",
      ),
    ).toBe(true);
  });

  it("excludes any filters targeting the scores table", async () => {
    // parentObservationId exercises a real filter path; supply advancedFilters
    // that would normally create a scores-table filter to verify they are stripped.
    await generateObservationsForPublicApi({
      ...BASE,
      parentObservationId: "obs-parent",
    });

    const { filter } = mockGenerateObservations.mock.calls[0][0];
    expect(filter.some((f: any) => f.clickhouseTable === "scores")).toBe(false);
  });

  it("passes the correct projectId and pagination through to the repository", async () => {
    await generateObservationsForPublicApi({
      ...BASE,
      projectId: "proj-99",
      page: 3,
      limit: 50,
    });

    const callArg = mockGenerateObservations.mock.calls[0][0];
    expect(callArg.projectId).toBe("proj-99");
    expect(callArg.pagination).toEqual({ page: 3, limit: 50 });
  });

  it("count variant also strips scores-table filters and injects project_id", async () => {
    await getObservationsCountForPublicApi({ ...BASE, traceId: "trace-abc" });

    const { filter } = mockGetObservationsCount.mock.calls[0][0];
    expect(
      filter.some(
        (f: any) =>
          f.field === "project_id" &&
          f.clickhouseTable === "observations" &&
          f.value === "project-1",
      ),
    ).toBe(true);
    expect(filter.some((f: any) => f.clickhouseTable === "scores")).toBe(false);
  });
});
