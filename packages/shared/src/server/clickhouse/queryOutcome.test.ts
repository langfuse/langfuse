import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLICKHOUSE_QUERY_OUTCOME_METRIC,
  CLICKHOUSE_RESOURCE_ERROR_OUTCOMES,
  clickHouseQueryOutcomeRouteLabel,
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
  });

  it("maps every ClickHouse resource error type to an outcome", () => {
    expect(CLICKHOUSE_RESOURCE_ERROR_OUTCOMES).toEqual({
      TIMEOUT: "timeout",
      MEMORY_LIMIT: "memory_limit",
      OVERCOMMIT: "overcommit",
    });
  });

  it("emits the outcome with bounded tags", () => {
    recordClickHouseQueryOutcome("timeout", {
      tag_schema_version: "1",
      surface: "publicapi",
      route: "GET /api/public/v2/observations",
      projectId: "project-1",
      sdkName: "python",
      sdkVersion: "3.12.0",
      userAgent: "python-httpx/0.28.1",
    });

    expect(recordIncrement).toHaveBeenCalledTimes(1);
    expect(recordIncrement).toHaveBeenCalledWith(
      CLICKHOUSE_QUERY_OUTCOME_METRIC,
      1,
      {
        outcome: "timeout",
        surface: "publicapi",
        route: "get_/api/public/v2/observations",
      },
    );
  });

  it("keeps unknown surfaces and unlabelled routes queryable", () => {
    recordClickHouseQueryOutcome("success", {
      tag_schema_version: "1",
      surface: "unknown",
    });

    expect(recordIncrement).toHaveBeenCalledWith(
      CLICKHOUSE_QUERY_OUTCOME_METRIC,
      1,
      { outcome: "success", surface: "unknown", route: "other" },
    );
  });
});
