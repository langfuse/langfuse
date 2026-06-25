import { describe, expect, it } from "vitest";
import { buildClickHouseLogComment } from "./queryTags";

describe("ClickHouse query tags", () => {
  it("builds v1 log comments from entrypoint context", () => {
    const logComment = buildClickHouseLogComment({
      surface: "publicapi",
      route:
        "GET /api/public/traces/123e4567-e89b-12d3-a456-426614174000?select=full",
      projectId: "project-1",
      feature: "legacy-field",
      operation_name: "legacy-field",
      type: "trace",
    });

    expect(JSON.parse(logComment)).toEqual({
      tag_schema_version: "1",
      surface: "publicapi",
      route:
        "GET /api/public/traces/123e4567-e89b-12d3-a456-426614174000?select=full",
      projectId: "project-1",
    });
  });

  it("uses unknown surface and omits route when request context is missing", () => {
    const logComment = buildClickHouseLogComment({ feature: "tracing" });

    expect(JSON.parse(logComment)).toEqual({
      tag_schema_version: "1",
      surface: "unknown",
    });
  });

  it("uses unknown values when tags are unavailable", () => {
    const logComment = buildClickHouseLogComment();

    expect(JSON.parse(logComment)).toEqual({
      tag_schema_version: "1",
      surface: "unknown",
    });
  });

  it("ignores non-entrypoint tags", () => {
    const logComment = buildClickHouseLogComment({
      surface: "publicapi",
      route: "GET /api/public/traces",
      feature: "legacy-feature",
      operation_name: "legacy-operation",
    });

    expect(JSON.parse(logComment)).toEqual({
      tag_schema_version: "1",
      surface: "publicapi",
      route: "GET /api/public/traces",
    });
  });
});
