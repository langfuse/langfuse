import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());
const mockQueryClickhouseWithProgress = vi.hoisted(() => vi.fn());
let charCounter = 0;

vi.mock("./clickhouse", async () => {
  const { isRow, isProgressRow, isException } =
    await vi.importActual<typeof import("@clickhouse/client")>(
      "@clickhouse/client",
    );

  return {
    ClickHouseResourceError: class extends Error {
      constructor(
        public readonly errorType: string,
        error: Error,
      ) {
        super(error.message);
      }
      static wrapIfResourceError(error: Error) {
        return error;
      }
    },
    ClickHouseQueryAbortedError: class extends Error {},
    queryClickhouse: mockQueryClickhouse,
    queryClickhouseWithProgress: mockQueryClickhouseWithProgress,
    isRow,
    isProgressRow,
    isException,
    commandClickhouse: vi.fn(),
    queryClickhouseStream: vi.fn(),
    queryClickhouseStreamRawText: vi.fn(),
    queryClickhouseExecRaw: vi.fn(),
    parseClickhouseUTCDateTimeFormat: vi.fn(
      (value: string) => new Date(value.replace(" ", "T") + "Z"),
    ),
    BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
    // Return unique names per call so filter parameter variables don't collide
    clickhouseCompliantRandomCharacters: vi.fn(() => `x${++charCounter}`),
  };
});

import {
  getObservationsForTraceFromEventsTable,
  getObservationsV2FromEventsTableForPublicApi,
  getObservationsV2PageFromEventsTableForPublicApi,
} from "./events";
import { ClickHouseQueryAbortedError } from "./clickhouse";
import { type EventsTableFilterState } from "../../types";

const inputContainsFilter: EventsTableFilterState = [
  { type: "string", column: "input", operator: "contains", value: "needle" },
];

const captureQuery = () => {
  const call = mockQueryClickhouse.mock.calls.at(0);
  // eslint-disable-next-line no-unsafe-optional-chaining
  return (call?.[0] as { query: string }).query;
};

const scanBounds = ({
  query,
  params,
}: {
  query: string;
  params: Record<string, string>;
}) =>
  Object.fromEntries(
    [...query.matchAll(/e\.start_time (>=|<=?) \{(\w+):/g)].map(
      ([, operator, name]) => [operator === ">=" ? "from" : "to", params[name]],
    ),
  );

const baseOpts = { projectId: "proj-1", page: 1, limit: 50 } as const;
const boundedOpts = {
  ...baseOpts,
  fields: ["core" as const],
  fromStartTime: "2026-10-01T00:00:00.000Z",
  toStartTime: "2026-10-19T00:00:00.000Z",
};
const observation = (id: string, startTime: string) => ({
  id,
  trace_id: "trace-1",
  project_id: "proj-1",
  start_time: startTime,
  type: "SPAN",
});

const rowEvent = <T>(row: T) => ({ row });
const progressEvent = (readRows: number, readBytes = 0) => ({
  progress: {
    read_rows: String(readRows),
    read_bytes: String(readBytes),
    elapsed_ns: "0",
  },
});
const mockProgressQuery = (...events: unknown[]) => {
  mockQueryClickhouseWithProgress.mockImplementationOnce(async function* () {
    for (const event of events) yield event;
  });
};
const mockProgressError = (error: Error) => {
  mockQueryClickhouseWithProgress.mockImplementationOnce(async function* () {
    yield progressEvent(0);
    throw error;
  });
};

describe("getObservationsForTraceFromEventsTable root flag", () => {
  beforeEach(() => {
    charCounter = 0;
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  it.each([
    { selectMetadata: true, selectIOAndMetadata: false },
    { selectMetadata: false, selectIOAndMetadata: true },
    { selectMetadata: true, selectIOAndMetadata: true },
    { selectMetadata: false, selectIOAndMetadata: false },
  ])("selects metadata independently of I/O: %j", async (selection) => {
    await getObservationsForTraceFromEventsTable({
      projectId: "proj-1",
      traceId: "trace-1",
      ...selection,
    });

    const query = captureQuery();
    expect(query.includes("e.metadata")).toBe(
      selection.selectMetadata || selection.selectIOAndMetadata,
    );
    expect(/\binput\b/.test(query)).toBe(selection.selectIOAndMetadata);
    expect(/\boutput\b/.test(query)).toBe(selection.selectIOAndMetadata);
  });

  it.each([false, true])(
    "selects natural and application roots with tool data=%s",
    async (selectToolData) => {
      await getObservationsForTraceFromEventsTable({
        projectId: "proj-1",
        traceId: "trace-1",
        selectToolData,
      });

      const query = captureQuery();
      expect(query).toContain(
        "toBool((e.parent_span_id = '' or e.is_app_root = true)) as \"is_root_observation\"",
      );
    },
  );
});

describe("getObservationsV2FromEventsTableForPublicApi query shape", () => {
  beforeEach(() => {
    charCounter = 0;
    vi.clearAllMocks();
    mockQueryClickhouseWithProgress.mockReset();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  afterEach(() => vi.restoreAllMocks());

  it("skips the io-lane split when a content filter forces base onto events_full", async () => {
    await getObservationsV2FromEventsTableForPublicApi(
      {
        ...baseOpts,
        fields: ["core", "io"],
        advancedFilters: inputContainsFilter,
      },
      { allowUnindexedIoFilters: true },
    );

    const query = captureQuery();
    // Single-pass scan on events_full: no base/io CTE split, io read inline.
    expect(query).not.toContain("FROM base");
    expect(query).not.toContain("_io_start_time");
    expect(query).toContain("e.input");
    expect(query).toContain("e.output");
    // Exactly one events_full read (the split would reference it twice).
    expect((query.match(/events_full/g) ?? []).length).toBe(1);
    expect(query).not.toContain("events_core");
  });

  it("keeps the io-lane split when no content filter forces events_full", async () => {
    await getObservationsV2FromEventsTableForPublicApi({
      ...baseOpts,
      fields: ["core", "io"],
    });

    const query = captureQuery();
    // Base filters on the cheap truncated table; io lane reads full columns
    // only for the matched, page-sized rows.
    expect(query).toContain("FROM events_core");
    expect(query).toContain("FROM base");
    expect(query).toContain("_io_start_time");
  });

  it("walks past empty windows, keeps the lookahead, and resumes with a row cursor", async () => {
    mockProgressQuery(
      rowEvent(observation("newer", "2026-10-12 00:00:00.000")),
    );
    mockProgressQuery(progressEvent(2_500_000));
    mockProgressQuery(
      rowEvent(observation("older", "2026-10-04 00:00:00.000")),
      rowEvent(observation("lookahead", "2026-10-02 00:00:00.000")),
    );

    const page = await getObservationsV2PageFromEventsTableForPublicApi({
      ...boundedOpts,
      fields: ["core"],
      limit: 2,
    });

    expect(page.items.map((row) => row.id)).toEqual(["newer", "older"]);
    expect(page.cursor).toEqual({
      lastStartTimeTo: new Date("2026-10-04T00:00:00.000Z"),
      lastTraceId: "trace-1",
      lastId: "older",
    });
    const calls = mockQueryClickhouseWithProgress.mock.calls.map(
      ([opts]) => opts,
    );
    expect(calls.map((opts) => scanBounds(opts).from)).toEqual([
      "2026-10-12 00:00:00.000",
      "2026-10-05 00:00:00.000",
      "2026-10-01 00:00:00.000",
    ]);
    expect(calls.map((opts) => opts.params.limit)).toEqual([3, 2, 2]);
  });

  it("returns no cursor once the effective structured time range is exhausted", async () => {
    mockProgressQuery();
    const page = await getObservationsV2PageFromEventsTableForPublicApi({
      ...boundedOpts,
      fields: ["core", "io"],
      advancedFilters: [
        {
          type: "datetime",
          column: "startTime",
          operator: ">=",
          value: new Date("2019-10-10T00:00:00Z"),
        },
        {
          type: "datetime",
          column: "startTime",
          operator: "<=",
          value: new Date("2019-10-11T00:00:00Z"),
        },
      ],
    });

    expect(page).toEqual({ items: [], cursor: undefined });
    expect(mockQueryClickhouseWithProgress).toHaveBeenCalledTimes(1);
    const call = mockQueryClickhouseWithProgress.mock.calls[0][0];
    expect(scanBounds(call)).toEqual({
      from: "2019-10-10 00:00:00.000",
      to: "2019-10-11 00:00:00.000",
    });
    expect(
      [
        ...call.query.matchAll(
          /e\.start_time (>=|<=?) \{\w+: (DateTime64\([^)]+\))\}/g,
        ),
      ]
        .slice(-2)
        .map((match) => match.slice(1)),
    ).toEqual([
      [">=", "DateTime64(3, 'UTC')"],
      ["<=", "DateTime64(3, 'UTC')"],
    ]);
    expect(call.query).toContain("FROM base");
  });

  it.each([45_000, 46_000])(
    "stops at the shared deadline: %i ms elapsed",
    async (elapsed) => {
      const clock = vi.spyOn(performance, "now").mockReturnValue(0);
      mockQueryClickhouseWithProgress.mockImplementationOnce(
        async function* () {
          clock.mockReturnValue(elapsed);
          yield rowEvent(observation("newer", "2026-10-13 00:00:00.000"));
        },
      );

      const page = await getObservationsV2PageFromEventsTableForPublicApi({
        ...boundedOpts,
        fields: ["core"],
      });

      expect(page.items.map((row) => row.id)).toEqual(["newer"]);
      expect(page.cursor?.lastStartTimeTo).toEqual(
        new Date("2026-10-12T00:00:00Z"),
      );
      expect(mockQueryClickhouseWithProgress).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    "rejects an unfinished empty page with interrupted query=%s",
    async (interrupted) => {
      const clock = vi.spyOn(performance, "now").mockReturnValue(0);
      mockQueryClickhouseWithProgress.mockImplementationOnce(
        async function* () {
          clock.mockReturnValue(interrupted ? 5_000 : 45_000);
          yield progressEvent(0);
        },
      );
      if (interrupted) mockProgressError(new ClickHouseQueryAbortedError());

      await expect(
        getObservationsV2PageFromEventsTableForPublicApi(boundedOpts),
      ).rejects.toMatchObject({ errorType: "TIMEOUT" });
      expect(mockQueryClickhouseWithProgress).toHaveBeenCalledTimes(
        interrupted ? 2 : 1,
      );
    },
  );

  it.each([30_000, 42_000, 44_999])(
    "keeps filling the page before the deadline: %i ms elapsed",
    async (elapsed) => {
      const clock = vi.spyOn(performance, "now").mockReturnValue(0);
      mockQueryClickhouseWithProgress.mockImplementationOnce(
        async function* () {
          clock.mockReturnValue(elapsed);
          yield progressEvent(0);
        },
      );
      mockProgressQuery(
        rowEvent(observation("older", "2026-10-11 00:00:00.000")),
        rowEvent(observation("lookahead", "2026-10-10 00:00:00.000")),
      );
      const page = await getObservationsV2PageFromEventsTableForPublicApi({
        ...boundedOpts,
        limit: 1,
      });
      expect(page.items.map((row) => row.id)).toEqual(["older"]);
      expect(page.cursor?.lastId).toBe("older");
      const calls = mockQueryClickhouseWithProgress.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[1][0].clickhouseSettings.max_execution_time).toBe(
        (45_000 - elapsed) / 1_000,
      );
    },
  );

  it("resumes the interrupted window from the last completed boundary", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    mockQueryClickhouseWithProgress.mockImplementationOnce(async function* () {
      clock.mockReturnValue(5_000);
      yield rowEvent(observation("newer", "2026-10-13 00:00:00.000"));
      yield progressEvent(1);
    });
    mockQueryClickhouseWithProgress.mockImplementationOnce(async function* () {
      yield rowEvent(observation("unfinished", "2026-10-11 00:00:00.000"));
      clock.mockReturnValue(45_000);
      throw new ClickHouseQueryAbortedError();
    });
    const page =
      await getObservationsV2PageFromEventsTableForPublicApi(boundedOpts);
    expect(page.items.map((row) => row.id)).toEqual(["newer"]);
    expect(page.cursor?.lastStartTimeTo).toEqual(
      new Date("2026-10-12T00:00:00Z"),
    );
    expect(mockQueryClickhouseWithProgress).toHaveBeenCalledTimes(2);
    expect(
      mockQueryClickhouseWithProgress.mock.calls[1][0].clickhouseSettings
        .max_execution_time,
    ).toBe(40);

    mockProgressQuery(
      rowEvent(observation("unfinished", "2026-10-11 00:00:00.000")),
    );
    mockProgressQuery();
    const resumed = await getObservationsV2PageFromEventsTableForPublicApi({
      ...boundedOpts,
      cursor: page.cursor,
    });
    expect(resumed.items.map((row) => row.id)).toEqual(["unfinished"]);
    expect(resumed.cursor).toBeUndefined();
    expect(
      scanBounds(mockQueryClickhouseWithProgress.mock.calls[2][0]).to,
    ).toBe("2026-10-12 00:00:00.000");
  });

  it("includes backfilled and future observations when no lower bound is supplied", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-19T00:00:00Z"));
    mockProgressQuery(
      rowEvent(observation("future", "2026-10-20 00:00:00.000")),
      progressEvent(1, 100),
    );
    mockProgressQuery(
      rowEvent(observation("backfilled", "2020-01-01 00:00:00.000")),
    );

    const page = await getObservationsV2PageFromEventsTableForPublicApi({
      ...baseOpts,
      fields: ["core"],
    });

    expect(page.items.map((row) => row.id)).toEqual(["future", "backfilled"]);
    expect(page.cursor).toBeUndefined();
    const calls = mockQueryClickhouseWithProgress.mock.calls;
    expect(calls).toHaveLength(2);
    expect(scanBounds(calls[0][0])).toEqual({
      from: "2026-10-12 00:00:00.000",
    });
    expect(scanBounds(calls[1][0]).from).toBe("2020-01-01 00:00:00.000");
  });

  it("finishes without querying ClickHouse when the upper bound precedes the default floor", async () => {
    const page = await getObservationsV2PageFromEventsTableForPublicApi({
      ...baseOpts,
      toStartTime: "2019-12-31T00:00:00Z",
    });
    expect(page).toEqual({ items: [], cursor: undefined });
    expect(mockQueryClickhouseWithProgress).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "byte estimate",
      scanned: 100_000,
      bytes: 1e9,
      elapsed: 0,
      days: 196,
    },
    {
      name: "client wall time",
      scanned: 100_000,
      bytes: 1e9,
      elapsed: 10_000,
      days: 22.4,
    },
    {
      name: "per-query row target",
      scanned: 2_000_000,
      bytes: 1e9,
      elapsed: 1_000,
      days: 17.5,
    },
    {
      name: "shrinking an expensive window",
      scanned: 100_000,
      bytes: 20e9,
      elapsed: 30_000,
      days: 2.8,
    },
    {
      name: "empty window without progress",
      scanned: undefined,
      bytes: 0,
      elapsed: 0,
      days: 28,
    },
    {
      name: "missing statistics with data",
      scanned: undefined,
      bytes: 0,
      elapsed: 1_000,
      days: 7,
      hasRow: true,
    },
  ])(
    "sizes the next future window using $name",
    async ({ scanned, bytes, elapsed, days, hasRow }) => {
      const clock = vi.spyOn(performance, "now").mockReturnValue(0);
      mockQueryClickhouseWithProgress.mockImplementationOnce(
        async function* () {
          clock.mockReturnValue(elapsed);
          if (scanned !== undefined) yield progressEvent(scanned, bytes);
          if (hasRow)
            yield rowEvent(observation("newest", "2099-12-26 00:00:00.000"));
        },
      );
      mockQueryClickhouseWithProgress.mockImplementationOnce(
        async function* () {
          clock.mockReturnValue(45_000);
          yield rowEvent(observation("future", "2099-12-24 00:00:00.000"));
        },
      );
      const page = await getObservationsV2PageFromEventsTableForPublicApi({
        ...boundedOpts,
        fromStartTime: "1970-01-01T00:00:00Z",
        toStartTime: "2100-01-01T00:00:00Z",
      });
      expect(page.items.map((row) => row.id)).toEqual(
        hasRow ? ["newest", "future"] : ["future"],
      );
      const calls = mockQueryClickhouseWithProgress.mock.calls;
      expect(calls).toHaveLength(2);
      const upper = Date.parse("2099-12-25T00:00:00Z");
      const lower = new Date(upper - days * 86_400_000);
      expect(scanBounds(calls[0][0]).from).toBe("2099-12-25 00:00:00.000");
      expect(scanBounds(calls[1][0]).from).toBe(
        lower.toISOString().replace("T", " ").replace("Z", ""),
      );
      expect(scanBounds(calls[1][0]).to).toBe("2099-12-25 00:00:00.000");
      expect(page.cursor?.lastStartTimeTo).toEqual(lower);
    },
  );

  it("recalibrates after crossing empty history into a byte-heavy window", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    mockProgressQuery(progressEvent(0));
    mockQueryClickhouseWithProgress.mockImplementationOnce(async function* () {
      clock.mockReturnValue(12_000);
      yield progressEvent(1_000_000, 40e9);
    });
    mockQueryClickhouseWithProgress.mockImplementationOnce(async function* () {
      clock.mockReturnValue(45_000);
      yield progressEvent(0);
    });
    await expect(
      getObservationsV2PageFromEventsTableForPublicApi({
        ...baseOpts,
        traceId: "trace-1",
        fromStartTime: "1970-01-01T00:00:00Z",
        toStartTime: "2026-10-19T00:00:00Z",
      }),
    ).rejects.toMatchObject({ errorType: "TIMEOUT" });
    const scans = mockQueryClickhouseWithProgress.mock.calls;
    expect(scans).toHaveLength(3);
    expect(
      scans.map(
        ([opts]) =>
          (Date.parse(scanBounds(opts).to.replace(" ", "T") + "Z") -
            Date.parse(scanBounds(opts).from.replace(" ", "T") + "Z")) /
          86_400_000,
      ),
    ).toEqual([7, 28, 14]);
  });

  it.each([
    {
      name: "typed cancellation",
      setup: () => mockProgressError(new ClickHouseQueryAbortedError()),
      assert: (error: unknown) =>
        expect(error).toMatchObject({ errorType: "TIMEOUT" }),
    },
    {
      name: "exception event",
      setup: () => mockProgressQuery({ exception: "Syntax error" }),
      assert: (error: unknown) =>
        expect(error).toMatchObject({ message: "Syntax error" }),
    },
  ])(
    "fails without inventing a continuation when no window completes: $name",
    async ({ setup, assert }) => {
      setup();
      let caught: unknown;
      try {
        await getObservationsV2PageFromEventsTableForPublicApi(boundedOpts);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeDefined();
      assert(caught);
      expect(mockQueryClickhouseWithProgress).toHaveBeenCalledTimes(1);
    },
  );
});
