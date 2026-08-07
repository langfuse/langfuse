import { NextRequest } from "next/server";
import type * as SharedServer from "@langfuse/shared/src/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "eu" as string | undefined,
    CLICKHOUSE_BILLING_METRICS_API_KEY: "chb-secret" as string | undefined,
  },
  findProject: vi.fn(),
  traceCounts: vi.fn(),
  observationCounts: vi.fn(),
  scoreCounts: vi.fn(),
  recordIncrement: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env: mocks.env }));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { project: { findUnique: mocks.findProject } },
}));

// Partial mock: the shared teardown hook imports redis/logger/ClickHouse from
// this module, so the real exports have to stay reachable.
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();

  return {
    ...actual,
    getTraceCountsByProjectInCreationInterval: mocks.traceCounts,
    getObservationCountsByProjectInCreationInterval: mocks.observationCounts,
    getScoreCountsByProjectInCreationInterval: mocks.scoreCounts,
    recordIncrement: mocks.recordIncrement,
  };
});

import { chbMetricsApiHandler } from "@/src/ee/features/billing/server/chb/chbMetricsApiHandler";
import { logger } from "@langfuse/shared/src/server";

const loggerError = vi
  .spyOn(logger, "error")
  .mockImplementation((() => {}) as never);

const PROJECT_ID = "project-1";

function createRequest({
  startTime = "2026-07-01T00:00:00Z",
  endTime = "2026-07-02T00:00:00Z",
  resourceId = PROJECT_ID,
  token = "chb-secret",
}: {
  startTime?: string;
  endTime?: string;
  resourceId?: string;
  token?: string | null;
} = {}) {
  const url = new URL("http://localhost/api/billing/metrics");
  if (startTime) url.searchParams.set("startTime", startTime);
  if (endTime) url.searchParams.set("endTime", endTime);
  if (resourceId) url.searchParams.set("resourceId", resourceId);

  return new NextRequest(url, {
    method: "GET",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("chbMetricsApiHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "eu";
    mocks.env.CLICKHOUSE_BILLING_METRICS_API_KEY = "chb-secret";
    mocks.findProject.mockResolvedValue({ id: PROJECT_ID });
    mocks.traceCounts.mockResolvedValue([{ projectId: PROJECT_ID, count: 7 }]);
    mocks.observationCounts.mockResolvedValue([
      { projectId: PROJECT_ID, count: 11 },
    ]);
    mocks.scoreCounts.mockResolvedValue([{ projectId: PROJECT_ID, count: 3 }]);
  });

  it("returns per-resource usage counts for an authorized poll", async () => {
    const response = await chbMetricsApiHandler(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      metrics: {
        traces: { sum: 7 },
        observations: { sum: 11 },
        scores: { sum: 3 },
      },
    });
    // The window is passed through as instants and scoped to the resource, so a
    // poll can never bill one org for another org's project.
    expect(mocks.traceCounts).toHaveBeenCalledWith({
      start: new Date("2026-07-01T00:00:00Z"),
      end: new Date("2026-07-02T00:00:00Z"),
      projectId: PROJECT_ID,
    });
  });

  it("returns zeros and a telemetry signal for an unknown resource", async () => {
    mocks.findProject.mockResolvedValue(null);
    mocks.traceCounts.mockResolvedValue([]);
    mocks.observationCounts.mockResolvedValue([]);
    mocks.scoreCounts.mockResolvedValue([]);

    const response = await chbMetricsApiHandler(
      createRequest({ resourceId: "never-existed" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      metrics: {
        traces: { sum: 0 },
        observations: { sum: 0 },
        scores: { sum: 0 },
      },
    });
    expect(mocks.recordIncrement).toHaveBeenCalledWith(
      "langfuse.billing_metrics.unknown_resource",
      1,
      { unit: "requests" },
    );
  });

  it("keeps the structured JSON contract when a count query fails", async () => {
    mocks.observationCounts.mockRejectedValue(new Error("Timeout error."));

    const response = await chbMetricsApiHandler(createRequest());

    // A transient ClickHouse failure must not surface as a zero-valued 200 --
    // CHB would meter the org for nothing -- nor as Next.js's default HTML 500.
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Failed to resolve usage metrics",
    });
    expect(loggerError).toHaveBeenCalled();
  });

  it.each([
    ["no authorization header", null],
    ["a wrong secret of equal length", "chb-secreT"],
    ["a wrong secret of different length", "nope"],
  ])("rejects %s with 401", async (_label, token) => {
    const response = await chbMetricsApiHandler(createRequest({ token }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Unauthorized" });
    expect(mocks.traceCounts).not.toHaveBeenCalled();
  });

  it("refuses to run when the API key is not configured", async () => {
    mocks.env.CLICKHOUSE_BILLING_METRICS_API_KEY = undefined;

    const response = await chbMetricsApiHandler(createRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Billing metrics endpoint is not configured",
    });
  });

  it("refuses to run outside Langfuse Cloud", async () => {
    mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    const response = await chbMetricsApiHandler(createRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Billing metrics endpoint only available in Langfuse Cloud",
    });
  });

  it.each([
    ["a non-ISO startTime", { startTime: "not-a-date" }],
    ["a missing resourceId", { resourceId: "" }],
  ])("rejects %s with 400", async (_label, overrides) => {
    const response = await chbMetricsApiHandler(createRequest(overrides));

    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe("Invalid query parameters");
    expect(mocks.traceCounts).not.toHaveBeenCalled();
  });

  it("rejects an inverted window with 400", async () => {
    const response = await chbMetricsApiHandler(
      createRequest({
        startTime: "2026-07-02T00:00:00Z",
        endTime: "2026-07-01T00:00:00Z",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "endTime must be after startTime",
    });
  });

  it("rejects a window wider than 35 days with 400", async () => {
    // Guards against full-history created_at scans, which have hit the
    // ClickHouse request ceiling in production.
    const response = await chbMetricsApiHandler(
      createRequest({
        startTime: "2026-01-01T00:00:00Z",
        endTime: "2026-07-01T00:00:00Z",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Requested window exceeds the 35 day maximum",
    });
    expect(mocks.traceCounts).not.toHaveBeenCalled();
  });
});
