import { afterEach, describe, expect, it, vi } from "vitest";
import { queryClickhouse } from "./clickhouse";
import { getObservationsV2FromEventsTableForPublicApi } from "./events";

vi.mock("./clickhouse", () => ({
  queryClickhouse: vi.fn().mockResolvedValue([]),
  queryClickhouseStream: vi.fn(),
  queryClickhouseStreamRawText: vi.fn(),
  queryClickhouseExecRaw: vi.fn(),
  commandClickhouse: vi.fn(),
  upsertClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  clickhouseCompliantRandomCharacters: vi.fn(() => "x"),
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
}));
vi.mock("../redis/redis", () => ({ redis: null }));

afterEach(() => vi.clearAllMocks());

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
  it.each([{ fields: ["basic"] }, { fields: ["basic", "io"] }] satisfies {
    fields: Options["fields"];
  }[])(
    "aggregates the whole project session before paginating $fields fields",
    async ({ fields }) => {
      const { query, params } = await captureQuery({
        fields,
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
      // Request filters and cursor must not truncate the duration aggregation.
      expect(aggregation?.match(/\{\w+:/g)).toEqual(["{projectId:"]);
      const membership =
        "e.session_id IN (SELECT session_id FROM session_duration WHERE duration >= {minSessionDuration: Float64})";
      expect(query).toContain(membership);
      expect(query.indexOf(membership)).toBeLessThan(query.indexOf("LIMIT"));
      expect(params).toMatchObject({
        projectId: "project-one",
        minSessionDuration: 17.5,
        lastStartTime: "2026-02-01 12:00:00.000",
        lastTraceId: "cursor-trace",
        lastId: "cursor-observation",
      });
      expect(Object.values(params ?? {})).toContain("requested-session");
      expect(Object.values(params ?? {})).toContainEqual(["requested-tag"]);
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
