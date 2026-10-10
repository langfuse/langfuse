import { describe, it, expect, beforeEach, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());
const mockShouldSkipObservationsFinal = vi.hoisted(() => vi.fn());
let charCounter = 0;

vi.mock("./clickhouse", () => ({
  queryClickhouse: mockQueryClickhouse,
  commandClickhouse: vi.fn(),
  queryClickhouseStream: vi.fn(),
  upsertClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  // Return unique names per call so filter parameter variables don't collide
  clickhouseCompliantRandomCharacters: vi.fn(() => `x${++charCounter}`),
}));

vi.mock("../queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: mockShouldSkipObservationsFinal,
}));

import { getObservationsTableCount } from "./observations";
import { type FilterState } from "../../types";

/**
 * Regression coverage for the observations-table time-filter pruning.
 *
 * The traces-join time pruning (`t.timestamp > {tracesTimestampFilter} -
 * INTERVAL 2 DAY`) only fires when the repository recognises a lower-bound
 * start-time filter. The UI date-range picker sends the column id `startTime`,
 * while worker batch export sends the display name `Start Time`. A regression
 * matched only the display name, so all standard UI traffic joined the traces
 * table without the time bound and scanned the full table.
 */
describe("getObservationsTableInternal — traces-join time pruning", () => {
  const PRUNING_CLAUSE =
    /t\.timestamp > \{tracesTimestampFilter: DateTime64\(3\)\} - INTERVAL 2 DAY/;

  const traceNameFilter = {
    column: "traceName",
    type: "stringOptions" as const,
    operator: "any of" as const,
    value: ["my-trace"],
  };

  const startTimeLowerBound = (column: "startTime" | "Start Time") => ({
    column,
    type: "datetime" as const,
    operator: ">=" as const,
    value: new Date("2026-07-04T00:00:00.000Z"),
  });

  beforeEach(() => {
    charCounter = 0;
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([{ count: "0" }]);
    mockShouldSkipObservationsFinal.mockResolvedValue(false);
  });

  it("prunes the traces join when the UI sends the `startTime` column id", async () => {
    const filter: FilterState = [
      traceNameFilter,
      startTimeLowerBound("startTime"),
    ];

    await getObservationsTableCount({ projectId: "proj-1", filter });

    expect(mockQueryClickhouse).toHaveBeenCalledOnce();
    const { query, params } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).toMatch(PRUNING_CLAUSE);
    expect(params).toHaveProperty("tracesTimestampFilter");
  });

  it("prunes the traces join when the export sends the `Start Time` display name", async () => {
    const filter: FilterState = [
      traceNameFilter,
      startTimeLowerBound("Start Time"),
    ];

    await getObservationsTableCount({ projectId: "proj-1", filter });

    expect(mockQueryClickhouse).toHaveBeenCalledOnce();
    const { query, params } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).toMatch(PRUNING_CLAUSE);
    expect(params).toHaveProperty("tracesTimestampFilter");
  });

  it("does not emit the pruning clause when the traces table is not joined", async () => {
    // No trace-level filter and no trace ordering → no LEFT JOIN traces, so
    // there is nothing to prune even though a start-time bound is present.
    const filter: FilterState = [startTimeLowerBound("startTime")];

    await getObservationsTableCount({ projectId: "proj-1", filter });

    expect(mockQueryClickhouse).toHaveBeenCalledOnce();
    const { query } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).not.toMatch(/LEFT JOIN traces/);
    expect(query).not.toMatch(PRUNING_CLAUSE);
  });
});
