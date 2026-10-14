import { afterEach, describe, expect, it, vi } from "vitest";
import { queryClickhouse } from "./clickhouse";
import { getObservationsV2FromEventsTableForPublicApi } from "./events";
import {
  clickhouseLocalAvailable,
  executeClickhouseLocal,
  substituteNamedParams,
} from "../query-ast/goldenHarness";

let charCounter = 0;

vi.mock("./clickhouse", () => ({
  queryClickhouse: vi.fn().mockResolvedValue([]),
  queryClickhouseStream: vi.fn(),
  queryClickhouseStreamRawText: vi.fn(),
  queryClickhouseExecRaw: vi.fn(),
  commandClickhouse: vi.fn(),
  upsertClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  clickhouseCompliantRandomCharacters: vi.fn(() => `x${++charCounter}`),
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
}));
vi.mock("../redis/redis", () => ({ redis: null }));

afterEach(() => {
  charCounter = 0;
  vi.clearAllMocks();
});

type Options = Parameters<
  typeof getObservationsV2FromEventsTableForPublicApi
>[0];

const captureQuery = async (options: Partial<Options> = {}) => {
  await getObservationsV2FromEventsTableForPublicApi({
    projectId: "project-one",
    page: 0,
    limit: 1,
    fields: ["basic"],
    ...options,
  });
  expect(queryClickhouse).toHaveBeenCalledTimes(1);
  return vi.mocked(queryClickhouse).mock.lastCall![0];
};

describe("public observations session duration filter", () => {
  it.skipIf(!clickhouseLocalAvailable())(
    "uses the latest version before grouping session membership and excluding deletions",
    async () => {
      const { query, params } = await captureQuery({ minSessionDuration: 60 });
      const aggregation = query.match(
        /session_duration AS \(([\s\S]*?GROUP BY session_id)\s*\)/,
      )?.[1];
      expect(aggregation).toBeDefined();

      // Memory keeps every version, so a background merge cannot hide the bug.
      // The schema also supports the shared Sessions UI aggregation.
      const fixture = `
        CREATE TABLE events_core (
          project_id String, trace_id String, span_id String,
          start_time DateTime64(6), end_time Nullable(DateTime64(6)),
          session_id String, event_ts DateTime64(6), is_deleted UInt8,
          parent_span_id String, user_id String, tags Array(String),
          environment String, usage_details Map(String, UInt64),
          cost_details Map(String, Decimal64(12))
        ) ENGINE = Memory;
        INSERT INTO events_core
          (project_id, trace_id, span_id, start_time, end_time, session_id, event_ts, is_deleted)
        SELECT project_id, trace_id, span_id, toDateTime64(start_seconds, 6),
          toDateTime64(end_seconds, 6), session_id, toDateTime64(version, 6), is_deleted
        FROM values(
          'project_id String, trace_id String, span_id String, start_seconds Int64,
           end_seconds Nullable(Int64), session_id String, version Int64, is_deleted UInt8',
          ('project-one', 'shortened', 's', 0, 120, 'shortened', 1, 0),
          ('project-one', 'shortened', 's', 0, 10, 'shortened', 2, 0),
          ('project-one', 'null-end', 's', 0, 120, 'null-end', 1, 0),
          ('project-one', 'null-end', 's', 0, NULL, 'null-end', 2, 0),
          ('project-one', 'moved', 's', 0, 120, 'old-session', 1, 0),
          ('project-one', 'moved', 's', 0, 10, 'new-session', 2, 0),
          ('project-one', 'cleared', 's', 0, 120, 'cleared', 1, 0),
          ('project-one', 'cleared', 's', 0, 10, '', 2, 0),
          ('project-one', 'deleted', 's', 0, 120, 'deleted', 1, 0),
          ('project-one', 'deleted', 's', 0, 120, 'deleted', 2, 1),
          ('project-one', 'trace-a', 'same-span', 0, 120, 'split-traces', 1, 0),
          ('project-one', 'trace-b', 'same-span', 0, 0, 'split-traces', 2, 0),
          ('project-one', 'trace-c', 'same-span', 0, 0, 'split-times', 1, 0),
          ('project-one', 'trace-c', 'same-span', 120, 120, 'split-times', 2, 0),
          ('project-two', 'foreign', 's', 0, 999, 'shortened', 3, 0)
        );
      `;
      const sql = substituteNamedParams(aggregation!, params ?? {});
      expect(
        executeClickhouseLocal(`${fixture}
          SELECT session_id, duration FROM (${sql}) ORDER BY session_id;
          SELECT session_id FROM (${sql}) WHERE duration >= 60 ORDER BY session_id;
        `),
      ).toBe(
        "new-session\t10\nnull-end\t0\nshortened\t10\nsplit-times\t120\nsplit-traces\t120\nsplit-times\nsplit-traces",
      );
    },
  );

  it.each([
    { fields: ["basic"], contentFilter: false },
    { fields: ["basic", "io"], contentFilter: false },
    { fields: ["basic", "io", "metadata"], contentFilter: true },
  ] satisfies {
    fields: Options["fields"];
    contentFilter: boolean;
  }[])(
    "aggregates the whole session before paginating $fields with content filter $contentFilter",
    async ({ fields, contentFilter }) => {
      const { query, params } = await captureQuery({
        fields,
        expandMetadataKeys: contentFilter ? ["payload"] : undefined,
        minSessionDuration: 17.5,
        sessionId: "requested-session",
        fromStartTime: "2026-02-01T00:00:00.000Z",
        toStartTime: "2026-02-02T00:00:00.000Z",
        advancedFilters: [
          {
            column: "tags",
            type: "arrayOptions",
            operator: "any of",
            value: ["requested-tag"],
          },
          ...(contentFilter
            ? [
                {
                  column: "input",
                  type: "string",
                  operator: "=",
                  value: "needle",
                } as const,
              ]
            : []),
        ],
        cursor: {
          lastStartTimeTo: new Date("2026-02-01T12:00:00.000Z"),
          lastTraceId: "cursor-trace",
          lastId: "cursor-observation",
        },
      });
      const aggregation = query.match(
        /session_duration AS \(([\s\S]*?GROUP BY session_id)\s*\)/,
      )?.[1];
      expect(aggregation).toBeDefined();
      expect(aggregation).toContain(
        "date_diff('second', min(start_time), max(if(isNull(end_time), start_time, end_time))) AS duration",
      );
      expect(aggregation).toContain("e.project_id = {projectId: String}");
      expect(aggregation).toContain("session_id != ''");
      expect(aggregation).not.toMatch(/sumMap|groupUniqArray|uniq\(/);
      // Request filters and cursor must not truncate the duration aggregation.
      expect([...new Set(aggregation?.match(/\{\w+:/g))]).toEqual([
        "{projectId:",
      ]);
      const membership =
        "e.session_id IN (SELECT session_id FROM session_duration WHERE duration >= {minSessionDuration: Float64})";
      expect(query).toContain(membership);
      expect(query.indexOf(membership)).toBeLessThan(
        query.lastIndexOf("LIMIT"),
      );
      expect(params).toMatchObject({
        projectId: "project-one",
        minSessionDuration: 17.5,
        lastStartTime: "2026-02-01 12:00:00.000",
        lastTraceId: "cursor-trace",
        lastId: "cursor-observation",
      });
      expect(Object.values(params ?? {})).toContain("requested-session");
      expect(Object.values(params ?? {})).toContainEqual(["requested-tag"]);
      if (contentFilter) {
        expect(query).not.toContain("FROM base");
        expect(query).not.toContain("_io_start_time");
        expect(query.match(/events_full/g)).toHaveLength(1);
        expect(query).toContain("e.input");
        expect(query).toContain("e.output");
        expect(query).toContain("e.metadata_values");
        expect(aggregation).toContain("FROM events_core");
        expect(Object.values(params ?? {})).toContain("needle");
      }
    },
  );

  it("accepts zero and applies the exact access floor without widening it", async () => {
    const { query, params } = await captureQuery({
      minSessionDuration: 0,
      sessionDataAccessFrom: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(query).toContain(
      "e.start_time >= {sessionDataAccessFrom: DateTime64(3)}",
    );
    expect(query).not.toContain("INTERVAL");
    expect(params).toMatchObject({
      minSessionDuration: 0,
      sessionDataAccessFrom: "2026-01-01 00:00:00.000",
    });
  });

  it("omits session aggregation when no duration filter is requested", async () => {
    const { query, params } = await captureQuery({
      sessionDataAccessFrom: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(query).not.toContain("session_duration");
    expect(query).not.toContain("GROUP BY session_id");
    expect(params).not.toHaveProperty("minSessionDuration");
    expect(params).not.toHaveProperty("sessionDataAccessFrom");
  });
});
