import { describe, expect, it } from "vitest";
import {
  buildClickHouseLogComment,
  sanitizeClickHouseRoute,
} from "./queryTags";

describe("ClickHouse query tags", () => {
  it("sanitizes URL routes for log comments", () => {
    expect(
      sanitizeClickHouseRoute(
        "GET https://cloud.langfuse.com/api/public/traces/123e4567-e89b-12d3-a456-426614174000?foo=bar",
      ),
    ).toBe("GET /api/public/traces/{id}");

    expect(sanitizeClickHouseRoute("traces.byId")).toBe("traces.byId");
  });

  it("builds v1 log comments from request context and feature tags", () => {
    const logComment = buildClickHouseLogComment({
      surface: "publicapi",
      route:
        "GET /api/public/traces/123e4567-e89b-12d3-a456-426614174000?select=full",
      feature: "tracing",
      projectId: "project-1",
      operation_name: "legacy-field",
      type: "trace",
    });

    expect(JSON.parse(logComment)).toEqual({
      tag_schema_version: "1",
      surface: "publicapi",
      route: "GET /api/public/traces/{id}",
      feature: "tracing",
      projectId: "project-1",
    });
  });

  it("throws when required tags are unavailable", () => {
    expect(() => buildClickHouseLogComment({ feature: "tracing" })).toThrow(
      "Missing or invalid ClickHouse query tag surface",
    );
  });

  it("throws when feature is outside the allowlist", () => {
    expect(() =>
      buildClickHouseLogComment({
        surface: "worker",
        route: "queue-name",
        feature: "legacy-feature",
      }),
    ).toThrow("Missing or invalid ClickHouse query tag feature");
  });
});
