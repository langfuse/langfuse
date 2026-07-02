const runtimeMocks = vi.hoisted(() => ({
  closeAllConnections: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  instrumentAsync: vi.fn(async (_ctx, callback) =>
    callback({ setAttribute: vi.fn() }),
  ),
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
  traceException: vi.fn(),
}));

const clickhouseMocks = vi.hoisted(() => ({
  commandClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(
    (value: string) => new Date(value.endsWith("Z") ? value : `${value}Z`),
  ),
  queryClickhouse: vi.fn(),
  queryClickhouseStream: vi.fn(),
  upsertClickhouse: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  redis: null,
  logger: {
    debug: runtimeMocks.debug,
  },
  ClickHouseClientManager: {
    getInstance: vi.fn(() => ({
      closeAllConnections: runtimeMocks.closeAllConnections,
    })),
  },
}));

vi.mock(
  "../../../../../packages/shared/src/server/repositories/clickhouse",
  () => clickhouseMocks,
);

vi.mock("../../../../../packages/shared/src/db", () => ({
  prisma: {},
}));

vi.mock("../../../../../packages/shared/src/server/instrumentation", () => ({
  instrumentAsync: runtimeMocks.instrumentAsync,
  recordDistribution: runtimeMocks.recordDistribution,
  recordIncrement: runtimeMocks.recordIncrement,
  traceException: runtimeMocks.traceException,
}));

vi.mock("../../../../../packages/shared/src/server/logger", () => ({
  logger: {
    debug: runtimeMocks.debug,
    error: runtimeMocks.error,
    info: runtimeMocks.info,
    warn: runtimeMocks.warn,
  },
}));

import {
  buildRelatedTracesByMetadataCorrelationFromEventsTableQuery,
  getRelatedTracesByMetadataCorrelationFromEventsTable,
} from "../../../../../packages/shared/src/server/repositories/events";
import { buildRelatedTracesByMetadataCorrelationQuery } from "../../../../../packages/shared/src/server/repositories/traces";

const normalizeSql = (query: string) => query.replace(/\s+/g, " ").trim();

describe("trace correlation repository queries", () => {
  it("keeps legacy traces lookup scoped by project, metadata correlation, and time window", () => {
    const query = normalizeSql(buildRelatedTracesByMetadataCorrelationQuery());

    expect(query).toContain("FROM traces");
    expect(query).toContain("project_id IN ({projectIds: Array(String)})");
    expect(query).toContain("timestamp >= {fromTimestamp: DateTime64(3)}");
    expect(query).toContain("timestamp <= {toTimestamp: DateTime64(3)}");
    expect(query).toContain("argMax(metadata, event_ts) AS trace_metadata");
    expect(query).toContain(
      "has(mapKeys(trace_metadata), {correlationKey: String})",
    );
    expect(query).toContain(
      "trace_metadata[{correlationKey: String}] = {correlationValue: String}",
    );
    expect(query).not.toContain("has(mapKeys(metadata),");
    expect(query).not.toContain("has(mapValues(trace_metadata),");
    expect(query).toContain("argMax(timestamp, event_ts) AS trace_timestamp");
    expect(query).toContain("argMax(is_deleted, event_ts) AS is_deleted");
    expect(query).toContain("WHERE is_deleted = 0");
    expect(query).toContain("LIMIT {limit: UInt32}");
  });

  it("keeps events lookup scoped by project, metadata correlation, and time window", () => {
    const query = normalizeSql(
      buildRelatedTracesByMetadataCorrelationFromEventsTableQuery(),
    );

    expect(query).toContain("FROM events_core e");
    expect(query).toContain("e.project_id IN ({projectIds: Array(String)})");
    expect(query).toContain("has(e.metadata_names, {correlationKey: String})");
    expect(query).toContain(
      "e.metadata_values[indexOf(e.metadata_names, {correlationKey: String})] = {correlationValue: String}",
    );
    expect(query).toContain("e.start_time >= {fromTimestamp: DateTime64(3)}");
    expect(query).toContain("e.start_time <= {toTimestamp: DateTime64(3)}");
    expect(query).toContain("e.parent_span_id = ''");
    expect(query).toContain("e.is_deleted = 0");
    expect(query).toContain("LIMIT {limit: UInt32}");
  });

  it("routes events lookup to the events read replica", async () => {
    clickhouseMocks.queryClickhouse.mockResolvedValueOnce([]);

    await getRelatedTracesByMetadataCorrelationFromEventsTable({
      projectIds: ["target-project"],
      correlationKey: "crossProjectCorrelationId",
      correlationValue: "workflow-1",
      fromTimestamp: new Date("2026-01-01T11:00:00.000Z"),
      toTimestamp: new Date("2026-01-01T13:00:00.000Z"),
      limit: 51,
      sourceProjectId: "source-project",
    });

    expect(clickhouseMocks.queryClickhouse).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredClickhouseService: "EventsReadOnly",
        query: expect.stringContaining("FROM events_core e"),
      }),
    );
  });
});
