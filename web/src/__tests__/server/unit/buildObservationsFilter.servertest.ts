const {
  mockGenerateObservations,
  mockGetObservationsCount,
  mockDeriveFilters,
  // A mutable holder so the mock factory (hoisted) can store the real
  // deriveFilters implementation for use as the default pass-through.
  realFns,
} = vi.hoisted(() => ({
  mockGenerateObservations: vi.fn(),
  mockGetObservationsCount: vi.fn(),
  mockDeriveFilters: vi.fn(),
  realFns: { deriveFilters: null as unknown },
}));

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  realFns.deriveFilters = (actual as Record<string, unknown>).deriveFilters;
  return {
    ...(actual as object),
    generateObservationsForPublicApi: mockGenerateObservations,
    getObservationsCountForPublicApi: mockGetObservationsCount,
    deriveFilters: mockDeriveFilters,
  };
});

import {
  generateObservationsForPublicApi,
  getObservationsCountForPublicApi,
} from "@/src/features/public-api/server/observations";
import { FilterList, StringFilter } from "@langfuse/shared/src/server";

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
    // Pass through to the real deriveFilters by default.
    mockDeriveFilters.mockImplementation((...args: unknown[]) =>
      (realFns.deriveFilters as (...a: unknown[]) => unknown)(...args),
    );
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

  it("strips scores-table filters even when deriveFilters produces them", async () => {
    // Simulate a future regression where deriveFilters somehow emits a
    // scores-table filter. The post-process strip in buildObservationsFilter
    // must remove it before the filter reaches the repository.
    mockDeriveFilters.mockReturnValueOnce(
      new FilterList([
        new StringFilter({
          clickhouseTable: "scores",
          field: "name",
          operator: "=",
          value: "accuracy",
        }),
        new StringFilter({
          clickhouseTable: "observations",
          field: "trace_id",
          operator: "=",
          value: "trace-abc",
        }),
      ]),
    );

    await generateObservationsForPublicApi(BASE);

    const { filter } = mockGenerateObservations.mock.calls[0][0];
    expect(filter.some((f: any) => f.clickhouseTable === "scores")).toBe(false);
    expect(filter.some((f: any) => f.clickhouseTable === "observations")).toBe(
      true,
    );
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

  it("count variant strips scores-table filters and injects project_id", async () => {
    // Same injection approach as the list variant to verify the strip runs
    // on the count path too.
    mockDeriveFilters.mockReturnValueOnce(
      new FilterList([
        new StringFilter({
          clickhouseTable: "scores",
          field: "value",
          operator: "=",
          value: "0.9",
        }),
      ]),
    );

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
