/**
 * Unit tests for metric-alert-repository NaN/null handling.
 *
 * These tests verify that each metric query function correctly handles
 * cases where ClickHouse returns null, NaN strings, or empty result sets —
 * all of which must be treated as 0 rather than propagating NaN into
 * the evaluator's compareMetric call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the ClickHouse client at the internal path used by the repository
vi.mock("@langfuse/shared/src/server/repositories/clickhouse", () => ({
  queryClickhouse: vi.fn(),
}));

// Import AFTER mocking so we get the mocked version
const { queryClickhouse } = await import(
  "@langfuse/shared/src/server/repositories/clickhouse"
);
const mockQuery = vi.mocked(queryClickhouse);

const {
  getTotalCostForWindow,
  getFailureRateForWindow,
  getP99LatencyForWindow,
  getAvgScoreForWindow,
} = await import(
  "@langfuse/shared/src/server/repositories/metric-alert-repository"
);

const PROJECT_ID = "proj-unit-test";
const LOOKBACK = 60;

describe("getTotalCostForWindow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 0 for empty result set", async () => {
    mockQuery.mockResolvedValue([]);
    expect(
      await getTotalCostForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
      }),
    ).toBe(0);
  });

  it("returns 0 when total_cost_usd is null", async () => {
    mockQuery.mockResolvedValue([{ total_cost_usd: null }]);
    expect(
      await getTotalCostForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
      }),
    ).toBe(0);
  });

  it('returns 0 when total_cost_usd is "nan" (ClickHouse empty aggregate)', async () => {
    mockQuery.mockResolvedValue([{ total_cost_usd: "nan" }]);
    expect(
      await getTotalCostForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
      }),
    ).toBe(0);
  });

  it("parses a numeric string value", async () => {
    mockQuery.mockResolvedValue([{ total_cost_usd: "3.75" }]);
    expect(
      await getTotalCostForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
      }),
    ).toBeCloseTo(3.75);
  });

  it("parses a numeric (number) value", async () => {
    mockQuery.mockResolvedValue([{ total_cost_usd: 1.5 }]);
    expect(
      await getTotalCostForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
      }),
    ).toBeCloseTo(1.5);
  });
});

describe("getFailureRateForWindow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 0 for empty result set", async () => {
    mockQuery.mockResolvedValue([]);
    expect(
      await getFailureRateForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
      }),
    ).toBe(0);
  });

  it('returns 0 when failure_rate is "nan"', async () => {
    mockQuery.mockResolvedValue([{ failure_rate: "nan" }]);
    expect(
      await getFailureRateForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
      }),
    ).toBe(0);
  });

  it("parses failure rate", async () => {
    mockQuery.mockResolvedValue([{ failure_rate: "0.42" }]);
    expect(
      await getFailureRateForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
      }),
    ).toBeCloseTo(0.42);
  });
});

describe("getP99LatencyForWindow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 0 for empty result set", async () => {
    mockQuery.mockResolvedValue([]);
    expect(
      await getP99LatencyForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
      }),
    ).toBe(0);
  });

  it("returns 0 when p99_latency_ms is null", async () => {
    mockQuery.mockResolvedValue([{ p99_latency_ms: null }]);
    expect(
      await getP99LatencyForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
      }),
    ).toBe(0);
  });

  it('returns 0 when p99_latency_ms is "nan"', async () => {
    mockQuery.mockResolvedValue([{ p99_latency_ms: "nan" }]);
    expect(
      await getP99LatencyForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
      }),
    ).toBe(0);
  });

  it("parses p99 latency", async () => {
    mockQuery.mockResolvedValue([{ p99_latency_ms: "250" }]);
    expect(
      await getP99LatencyForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
      }),
    ).toBeCloseTo(250);
  });
});

describe("getAvgScoreForWindow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 0 for empty result set", async () => {
    mockQuery.mockResolvedValue([]);
    expect(
      await getAvgScoreForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
        scoreName: "quality",
      }),
    ).toBe(0);
  });

  it("returns 0 when avg_score is null", async () => {
    mockQuery.mockResolvedValue([{ avg_score: null }]);
    expect(
      await getAvgScoreForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
        scoreName: "quality",
      }),
    ).toBe(0);
  });

  it('returns 0 when avg_score is "nan"', async () => {
    mockQuery.mockResolvedValue([{ avg_score: "nan" }]);
    expect(
      await getAvgScoreForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
        scoreName: "quality",
      }),
    ).toBe(0);
  });

  it("parses avg score", async () => {
    mockQuery.mockResolvedValue([{ avg_score: "0.91" }]);
    expect(
      await getAvgScoreForWindow({
        projectId: PROJECT_ID,
        lookbackWindowMinutes: LOOKBACK,
        scoreName: "quality",
      }),
    ).toBeCloseTo(0.91);
  });
});
