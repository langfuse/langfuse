import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLICKHOUSE_QUERY_OUTCOME_METRIC,
  CLICKHOUSE_RESOURCE_ERROR_OUTCOMES,
  clickHouseQueryHasIoContentFilter,
  clickHouseQueryOutcomeRouteLabel,
  clickHouseQueryTableLabel,
  recordClickHouseQueryOutcome,
} from "./queryOutcome";

const recordIncrement = vi.fn();

vi.mock("../instrumentation", () => ({
  recordIncrement: (...args: unknown[]) => recordIncrement(...args),
}));

describe("ClickHouse query outcome metric", () => {
  beforeEach(() => {
    recordIncrement.mockClear();
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
      ["listObservations", "listObservations"],
      ["trace_redirect", "trace_redirect"],
    ])("labels the bare route %s verbatim", (route, expected) => {
      expect(clickHouseQueryOutcomeRouteLabel(route)).toBe(expected);
    });

    it("counts an unlisted bare route under the catch-all label", () => {
      expect(clickHouseQueryOutcomeRouteLabel("traces.byId")).toBe("other");
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

  describe("io content filter classification", () => {
    // The two shapes the filter compiler emits for a substring/token search on
    // input/output, plus a bare (I)LIKE fallback. See fts.ts.
    it.each([
      "SELECT id FROM events_full e WHERE position(lower(e.output), lower({p: String})) > 0",
      "SELECT id FROM events_full e WHERE hasAllTokens(lower(e.input), arraySlice(arrayDistinct(tokens(lower({p: String}))), 1, 64))",
      "SELECT id FROM observations o WHERE o.input ILIKE {p: String}",
      "SELECT id FROM events_full e WHERE output LIKE {p: String}",
    ])("flags a content scan over input/output: %s", (query) => {
      expect(clickHouseQueryHasIoContentFilter(query)).toBe(true);
    });

    // A metadata token search uses the same functions on a different column and
    // must not be counted, nor must an exact equality or an unrelated query.
    it.each([
      "SELECT id FROM events_full e WHERE hasAllTokens(e.metadata_values, arraySlice({p: Array(String)}, 1, 64))",
      "SELECT id FROM events_full e WHERE e.input = {p: String}",
      "SELECT id FROM events_full e WHERE e.project_id = {p: String}",
      "SELECT count() FROM traces",
    ])("does not flag %s", (query) => {
      expect(clickHouseQueryHasIoContentFilter(query)).toBe(false);
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
      true,
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
        io_content_filter: "true",
      },
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
      false,
    );

    expect(recordIncrement).toHaveBeenCalledWith(
      CLICKHOUSE_QUERY_OUTCOME_METRIC,
      1,
      {
        outcome: "success",
        surface: "unknown",
        route: "other",
        table: "other",
        io_content_filter: "false",
      },
    );
  });
});
