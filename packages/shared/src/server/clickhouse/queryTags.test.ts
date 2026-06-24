import { describe, expect, it } from "vitest";
import { buildClickHouseLogComment } from "./queryTags";

describe("ClickHouse query tags", () => {
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
      route:
        "GET /api/public/traces/123e4567-e89b-12d3-a456-426614174000?select=full",
      feature: "tracing",
      projectId: "project-1",
    });
  });

  it("uses unknown surface and omits route when request context is missing", () => {
    const logComment = buildClickHouseLogComment({ feature: "tracing" });

    expect(JSON.parse(logComment)).toEqual({
      tag_schema_version: "1",
      surface: "unknown",
      feature: "tracing",
    });
  });

  it("uses unknown values when tags are unavailable", () => {
    const logComment = buildClickHouseLogComment();

    expect(JSON.parse(logComment)).toEqual({
      tag_schema_version: "1",
      surface: "unknown",
      feature: "unknown",
    });
  });

  it("uses unknown feature when feature is outside the allowlist", () => {
    const logComment = buildClickHouseLogComment({
      surface: "publicapi",
      route: "GET /api/public/traces",
      feature: "legacy-feature",
    });

    expect(JSON.parse(logComment)).toEqual({
      tag_schema_version: "1",
      surface: "publicapi",
      route: "GET /api/public/traces",
      feature: "unknown",
    });
  });
});
