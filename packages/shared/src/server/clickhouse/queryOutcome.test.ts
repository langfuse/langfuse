import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLICKHOUSE_QUERY_OUTCOME_METRIC,
  CLICKHOUSE_QUERY_PERFORMANCE_METRICS,
  CLICKHOUSE_RESOURCE_ERROR_OUTCOMES,
  clickHouseQueryOutcomeRouteLabel,
  clickHouseQueryShape,
  clickHouseQueryTableLabel,
  recordClickHouseQueryOutcome,
  recordClickHouseQueryPerformance,
} from "./queryOutcome";

const recordIncrement = vi.fn();
const recordDistribution = vi.fn();

vi.mock("../instrumentation", () => ({
  recordIncrement: (...args: unknown[]) => recordIncrement(...args),
  recordDistribution: (...args: unknown[]) => recordDistribution(...args),
}));

describe("ClickHouse query outcome metric", () => {
  beforeEach(() => {
    recordIncrement.mockClear();
    recordDistribution.mockClear();
  });

  describe("route labels", () => {
    it.each([
      ["GET /api/public/v2/observations", "get_/api/public/v2/observations"],
      ["GET /api/public/v2/metrics", "get_/api/public/v2/metrics"],
      ["GET /api/public/v3/scores", "get_/api/public/v3/scores"],
    ])("labels %s as the APM resource name", (route, expected) => {
      expect(clickHouseQueryOutcomeRouteLabel(route)).toBe(expected);
    });

    it("normalizes a trailing slash before matching", () => {
      expect(
        clickHouseQueryOutcomeRouteLabel("GET /api/public/v3/scores/"),
      ).toBe("get_/api/public/v3/scores");
    });

    // The route tag is derived from the request path, so caller-controlled
    // segments would otherwise become unbounded metric tag values.
    it.each([
      "GET /api/public/traces/123e4567-e89b-12d3-a456-426614174000",
      "GET /api/public/v2/prompts/dashboard.status_headline.low.de",
      "GET /api/public/v2/observations/some-observation-id",
      "HEAD /api/public/v2/observations",
      "POST /api/public/v2/metrics",
    ])("counts %s under the catch-all label", (route) => {
      expect(clickHouseQueryOutcomeRouteLabel(route)).toBe("other");
    });

    it.each([undefined, "", "   ", "no-method-separator"])(
      "falls back to the catch-all label for %s",
      (route) => {
        expect(clickHouseQueryOutcomeRouteLabel(route)).toBe("other");
      },
    );

    // tRPC procedure paths and MCP tool names carry no method prefix and are
    // code-defined, so they are matched verbatim against the bare allowlist.
    it.each([
      ["events.all", "events.all"],
      ["events.batchIO", "events.batchIO"],
      ["events.experimentBatchIO", "events.experimentBatchIO"],
      ["events.sessionBatchIO", "events.sessionBatchIO"],
      ["events.filterOptions", "events.filterOptions"],
      ["experiments.batchIO", "experiments.batchIO"],
      ["scores.allFromEvents", "scores.allFromEvents"],
      ["scores.countAllFromEvents", "scores.countAllFromEvents"],
      ["traces.byId", "traces.byId"],
      ["listObservations", "listObservations"],
      ["trace_redirect", "trace_redirect"],
    ])("labels the bare route %s verbatim", (route, expected) => {
      expect(clickHouseQueryOutcomeRouteLabel(route)).toBe(expected);
    });

    it("counts an unlisted bare route under the catch-all label", () => {
      expect(clickHouseQueryOutcomeRouteLabel("prompts.all")).toBe("other");
    });
  });

  describe("table labels", () => {
    it.each([
      [
        "SELECT * FROM events_full WHERE project_id = {p:String}",
        "events_full",
      ],
      ["SELECT count() FROM events_core FINAL", "events_core"],
      [
        "SELECT * FROM observations o WHERE o.project_id = {p:String}",
        "observations",
      ],
      ["SELECT * FROM traces WHERE id = {id:String}", "traces"],
      ["SELECT * FROM scores WHERE project_id = {p:String}", "scores"],
      // Worker ingestion checks dataset-run membership per trace; the physical
      // table is dataset_run_items_rmt but the label drops the engine suffix.
      [
        "SELECT dri.dataset_item_id FROM dataset_run_items_rmt dri WHERE project_id = {p:String}",
        "dataset_run_items",
      ],
      [
        "SELECT * FROM blob_storage_file_log FINAL WHERE project_id = {p:String}",
        "blob_storage_file_log",
      ],
    ])("labels %s as %s", (query, expected) => {
      expect(clickHouseQueryTableLabel(query)).toBe(expected);
    });

    it("prefers the events tables when several tables appear", () => {
      expect(
        clickHouseQueryTableLabel(
          "SELECT * FROM events_full LEFT JOIN traces USING (id)",
        ),
      ).toBe("events_full");
    });

    // The Scores UI reads FROM scores and LEFT JOINs traces; the label must
    // follow the table under load, not the join partner.
    it("labels a FROM table over its join partner", () => {
      expect(
        clickHouseQueryTableLabel(
          "SELECT * FROM scores s FINAL LEFT JOIN traces t ON s.trace_id = t.id",
        ),
      ).toBe("scores");
    });

    it("matches a schema-qualified FROM table", () => {
      expect(
        clickHouseQueryTableLabel("SELECT * FROM default.events_full"),
      ).toBe("events_full");
    });

    it("does not match a table name inside a longer identifier", () => {
      expect(
        clickHouseQueryTableLabel("SELECT * FROM observations_batch_staging"),
      ).toBe("other");
      expect(clickHouseQueryTableLabel("SELECT * FROM traces_null")).toBe(
        "other",
      );
    });

    it("falls back to other for an unrecognised table", () => {
      expect(clickHouseQueryTableLabel("SELECT 1")).toBe("other");
    });
  });

  describe("query shape labels", () => {
    // The two shapes the FTS compiler emits for an input/output search, plus a
    // bare (I)LIKE fallback. See fts.ts.
    it.each([
      "SELECT id FROM events_full e WHERE position(lower(e.output), lower({p: String})) > 0",
      "SELECT id FROM events_full e WHERE hasAllTokens(lower(e.input), arraySlice(arrayDistinct(tokens(lower({p: String}))), 1, 64))",
      "SELECT id FROM observations o WHERE o.input ILIKE {p: String}",
      "SELECT id FROM events_full e WHERE output LIKE {p: String}",
      // "starts with" / "ends with" UI filters on the string input/output cols.
      "SELECT id FROM events_full e WHERE startsWith(e.input, {p: String})",
      "SELECT id FROM events_full e WHERE endsWith(e.output, {p: String})",
    ])("labels an input/output content search as io_content: %s", (query) => {
      expect(clickHouseQueryShape(query)).toBe("io_content");
    });

    // Metadata search runs the same functions over the _names/_values arrays.
    it.each([
      "SELECT id FROM events_full e WHERE has(e.metadata_names, {k: String}) AND (position(e.metadata_values[indexOf(e.metadata_names, {k: String})], {v: String}) > 0)",
      "SELECT id FROM events_full e WHERE hasAllTokens(e.metadata_values, arraySlice({t: Array(String)}, 1, 64))",
    ])("labels a metadata content search as metadata_content: %s", (query) => {
      expect(clickHouseQueryShape(query)).toBe("metadata_content");
    });

    it("labels the OR-of-ILIKE id search arm as id_or_ilike", () => {
      expect(
        clickHouseQueryShape(
          "SELECT id FROM events_full e WHERE e.project_id = {p: String} AND (e.span_id ILIKE {searchString: String} OR e.trace_id ILIKE {searchString: String})",
        ),
      ).toBe("id_or_ilike");
    });

    it.each([
      "SELECT * FROM events_full e WHERE e.project_id = {p: String} AND span_id = {id: String}",
      // Batch IO fetch uses the paren-less IN {param} form.
      "SELECT * FROM events_full e WHERE e.span_id IN {observationIds: Array(String)}",
    ])("labels a span_id lookup as by_span_id: %s", (query) => {
      expect(clickHouseQueryShape(query)).toBe("by_span_id");
    });

    // A span lookup that also bounds trace_id is a span lookup, not a
    // by_trace_id scan: by_span_id outranks by_trace_id.
    it("labels a span lookup that also bounds trace_id as by_span_id", () => {
      expect(
        clickHouseQueryShape(
          "SELECT * FROM events_full e WHERE span_id = {id: String} AND trace_id = {traceId: String}",
        ),
      ).toBe("by_span_id");
    });

    it.each([
      "SELECT * FROM events_full e WHERE trace_id IN ({traceIds: Array(String)})",
      // Batch/event queries emit the paren-less IN {param} form.
      "SELECT * FROM events_full e WHERE trace_id IN {traceIds: Array(String)}",
      "SELECT * FROM events_full e WHERE trace_id = {traceId: String}",
    ])("labels a trace_id lookup as by_trace_id: %s", (query) => {
      expect(clickHouseQueryShape(query)).toBe("by_trace_id");
    });

    // A metadata search must not be counted as io_content, and an exact
    // equality / unrelated query has no shape.
    it.each([
      "SELECT id FROM events_full e WHERE e.input = {p: String}",
      "SELECT id FROM events_full e WHERE e.project_id = {p: String}",
      "SELECT count() FROM traces",
    ])("labels %s as other", (query) => {
      expect(clickHouseQueryShape(query)).toBe("other");
    });

    // trace_id in the OR-ILIKE arm is a search predicate, not a by_trace_id
    // lookup; the whole query is id_or_ilike.
    it("does not mistake an ILIKE trace_id arm for a by_trace_id lookup", () => {
      expect(
        clickHouseQueryShape(
          "SELECT id FROM events_full e WHERE (e.trace_id ILIKE {searchString: String})",
        ),
      ).toBe("id_or_ilike");
    });

    describe("scores dedup strategies", () => {
      const latestJoin = `
        SELECT s.id FROM (
          SELECT s.* FROM scores s
          INNER JOIN (
            SELECT s.id AS latest_id, max(s.event_ts) AS latest_event_ts
            FROM scores s
            WHERE s.project_id = {projectId: String}
            %SEEK%
            GROUP BY s.project_id, toDate(s.timestamp), s.name, s.id
          ) latest ON s.id = latest.latest_id AND s.event_ts = latest.latest_event_ts
          WHERE s.trace_id = {traceId: String}
          LIMIT 1 BY s.project_id, toDate(s.timestamp), s.name, s.id
        ) s`;

      it.each([
        "SELECT s.id FROM (SELECT s.* FROM scores s FINAL WHERE s.project_id = {projectId: String}) s",
        "SELECT * FROM scores FINAL WHERE project_id = {projectId: String}",
      ])("labels a FINAL read as scores_final: %s", (query) => {
        expect(clickHouseQueryShape(query)).toBe("scores_final");
      });

      // The seek's trace_id predicate would otherwise make it by_trace_id.
      it("labels the latest-version join with a seek as scores_join_seek", () => {
        const query = latestJoin.replace(
          "%SEEK%",
          "AND (s.project_id, toDate(s.timestamp), s.name, s.id) IN (SELECT DISTINCT s.project_id, toDate(s.timestamp), s.name, s.id FROM scores s WHERE s.trace_id = {traceId: String})",
        );
        expect(clickHouseQueryShape(query)).toBe("scores_join_seek");
      });

      it("labels the latest-version join without a seek as scores_join", () => {
        expect(clickHouseQueryShape(latestJoin.replace("%SEEK%", ""))).toBe(
          "scores_join",
        );
      });

      it("does not label FINAL on another table as a scores shape", () => {
        expect(
          clickHouseQueryShape(
            "SELECT * FROM traces t FINAL WHERE t.id = {id: String}",
          ),
        ).toBe("other");
      });

      // A scores FINAL subquery under an events read keeps the events table
      // label, so the scores shapes do not apply.
      it("applies the scores shapes only when the table label is scores", () => {
        const query =
          "SELECT * FROM events_full e WHERE e.trace_id = {traceId: String} AND e.span_id IN (SELECT observation_id FROM scores s FINAL)";
        expect(clickHouseQueryTableLabel(query)).toBe("events_full");
        expect(clickHouseQueryShape(query)).toBe("by_trace_id");
        expect(clickHouseQueryShape(query, "scores")).toBe("scores_final");
      });
    });
  });

  it("maps every ClickHouse resource error type to an outcome", () => {
    expect(CLICKHOUSE_RESOURCE_ERROR_OUTCOMES).toEqual({
      TIMEOUT: "timeout",
      MEMORY_LIMIT: "memory_limit",
      OVERCOMMIT: "overcommit",
    });
  });

  it("emits the outcome with bounded tags", () => {
    recordClickHouseQueryOutcome(
      "timeout",
      {
        tag_schema_version: "1",
        surface: "publicapi",
        route: "GET /api/public/v2/observations",
        projectId: "project-1",
        sdkName: "python",
        sdkVersion: "3.12.0",
        userAgent: "python-httpx/0.28.1",
      },
      "events_full",
      "io_content",
      "events_read_replica",
    );

    expect(recordIncrement).toHaveBeenCalledTimes(1);
    expect(recordIncrement).toHaveBeenCalledWith(
      CLICKHOUSE_QUERY_OUTCOME_METRIC,
      1,
      {
        outcome: "timeout",
        surface: "publicapi",
        route: "get_/api/public/v2/observations",
        table: "events_full",
        query_shape: "io_content",
        clickhouse_service: "events_read_replica",
      },
    );
  });

  it("emits the summary header as distributions with the outcome tags", () => {
    recordClickHouseQueryPerformance(
      {
        read_rows: "1200",
        read_bytes: "524288",
        written_rows: "0",
        elapsed_ns: "37500000",
        memory_usage: "8388608",
      },
      {
        tag_schema_version: "1",
        surface: "trpc",
        route: "scores.allFromEvents",
        projectId: "project-1",
      },
      "scores",
      "scores_final",
      "main",
    );

    const tags = {
      surface: "trpc",
      route: "scores.allFromEvents",
      table: "scores",
      query_shape: "scores_final",
      clickhouse_service: "main",
    };
    expect(recordDistribution.mock.calls).toEqual([
      [CLICKHOUSE_QUERY_PERFORMANCE_METRICS.elapsedMs, 37.5, tags],
      [CLICKHOUSE_QUERY_PERFORMANCE_METRICS.readBytes, 524288, tags],
      [CLICKHOUSE_QUERY_PERFORMANCE_METRICS.readRows, 1200, tags],
      [CLICKHOUSE_QUERY_PERFORMANCE_METRICS.memoryBytes, 8388608, tags],
    ]);
  });

  it("skips summary keys that are missing or not numeric", () => {
    recordClickHouseQueryPerformance(
      { read_rows: "10", read_bytes: "n/a" },
      { tag_schema_version: "1", surface: "unknown" },
      "other",
      "other",
      "main",
    );

    expect(recordDistribution).toHaveBeenCalledTimes(1);
    expect(recordDistribution).toHaveBeenCalledWith(
      CLICKHOUSE_QUERY_PERFORMANCE_METRICS.readRows,
      10,
      expect.any(Object),
    );
  });

  it("keeps unknown surfaces and unlabelled routes queryable", () => {
    recordClickHouseQueryOutcome(
      "success",
      {
        tag_schema_version: "1",
        surface: "unknown",
      },
      "other",
      "other",
      "main",
    );

    expect(recordIncrement).toHaveBeenCalledWith(
      CLICKHOUSE_QUERY_OUTCOME_METRIC,
      1,
      {
        outcome: "success",
        surface: "unknown",
        route: "other",
        table: "other",
        query_shape: "other",
        clickhouse_service: "main",
      },
    );
  });
});
