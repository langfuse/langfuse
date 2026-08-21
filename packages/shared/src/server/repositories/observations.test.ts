import { describe, it, expect, beforeEach, vi } from "vitest";

// getObservationsForTrace must cap the number of rows it fetches/converts for
// a trace instead of issuing an unbounded ClickHouse query (a trace with tens
// of thousands of spans would otherwise be fetched and JS-converted in full).
// Override the limit to a small number so the test stays fast while still
// exercising the real slicing/truncation logic.
const TEST_LIMIT = vi.hoisted(() => 3);

vi.mock("../../env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      LANGFUSE_MAX_OBSERVATIONS_PER_TRACE: TEST_LIMIT,
    },
  };
});

const mockQueryClickhouse = vi.hoisted(() => vi.fn());
const mockShouldSkipObservationsFinal = vi.hoisted(() => vi.fn());

vi.mock("./clickhouse", () => ({
  queryClickhouse: mockQueryClickhouse,
  commandClickhouse: vi.fn(),
  queryClickhouseStream: vi.fn(),
  queryClickhouseStreamRawText: vi.fn(),
  queryClickhouseExecRaw: vi.fn(),
  upsertClickhouse: vi.fn(),
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
  // Real implementation: convertObservation (invoked by getObservationsForTrace)
  // relies on this to parse the mocked row timestamps.
  parseClickhouseUTCDateTimeFormat: (dateStr: string) =>
    new Date(`${dateStr.replace(" ", "T")}Z`),
}));

vi.mock("../queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: mockShouldSkipObservationsFinal,
}));

import {
  getObservationsForTrace,
  OBSERVATIONS_FOR_TRACE_LIMIT,
} from "./observations";
import type { ObservationRecordReadType } from "./definitions";

const makeRow = (id: string, startTime: string): ObservationRecordReadType =>
  ({
    id,
    trace_id: "trace-1",
    project_id: "project-1",
    type: "SPAN",
    parent_observation_id: null,
    environment: "default",
    name: "obs",
    metadata: {},
    level: "DEFAULT",
    status_message: null,
    version: null,
    provided_model_name: null,
    internal_model_id: null,
    model_parameters: null,
    total_cost: null,
    usage_pricing_tier_id: null,
    usage_pricing_tier_name: null,
    prompt_id: null,
    prompt_name: null,
    prompt_version: null,
    is_deleted: 0,
    created_at: startTime,
    updated_at: startTime,
    start_time: startTime,
    end_time: null,
    completion_start_time: null,
    event_ts: startTime,
    provided_usage_details: {},
    provided_cost_details: {},
    usage_details: {},
    cost_details: {},
  }) as unknown as ObservationRecordReadType;

describe("getObservationsForTrace row cap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldSkipObservationsFinal.mockResolvedValue(true);
  });

  it("respects the configured LANGFUSE_MAX_OBSERVATIONS_PER_TRACE override", () => {
    expect(OBSERVATIONS_FOR_TRACE_LIMIT).toBe(TEST_LIMIT);
  });

  it("issues a bounded ClickHouse query (LIMIT fetchLimit = cap + 1)", async () => {
    mockQueryClickhouse.mockResolvedValue([]);

    await getObservationsForTrace({
      traceId: "trace-1",
      projectId: "project-1",
    });

    expect(mockQueryClickhouse).toHaveBeenCalledOnce();
    const { query, params } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).toContain("LIMIT {fetchLimit: UInt32}");
    expect(query).toContain("ORDER BY start_time ASC");
    expect(params.fetchLimit).toBe(TEST_LIMIT + 1);
  });

  it("truncates and reports truncated:true when more rows exist than the cap", async () => {
    // ClickHouse returns cap + 1 rows (the fetchLimit), which is how the
    // function detects that the trace has more observations than the cap.
    const rows = Array.from({ length: TEST_LIMIT + 1 }, (_, i) =>
      makeRow(`obs-${i}`, "2024-01-01 00:00:00.000"),
    );
    mockQueryClickhouse.mockResolvedValue(rows);

    const result = await getObservationsForTrace({
      traceId: "trace-1",
      projectId: "project-1",
    });

    expect(result.truncated).toBe(true);
    expect(result.observations).toHaveLength(TEST_LIMIT);
  });

  it("reports truncated:false when the row count is within the cap", async () => {
    const rows = Array.from({ length: TEST_LIMIT }, (_, i) =>
      makeRow(`obs-${i}`, "2024-01-01 00:00:00.000"),
    );
    mockQueryClickhouse.mockResolvedValue(rows);

    const result = await getObservationsForTrace({
      traceId: "trace-1",
      projectId: "project-1",
    });

    expect(result.truncated).toBe(false);
    expect(result.observations).toHaveLength(TEST_LIMIT);
  });
});
