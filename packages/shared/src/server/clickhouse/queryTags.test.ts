import { describe, expect, it, vi } from "vitest";
import {
  buildClickHouseLogComment,
  setClickHouseQueryTagTestFallbackForTests,
} from "./queryTags";

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

  it("throws when required tags are unavailable", () => {
    setClickHouseQueryTagTestFallbackForTests(false);

    try {
      expect(() => buildClickHouseLogComment({ feature: "tracing" })).toThrow(
        "Missing or invalid ClickHouse query tag surface",
      );
    } finally {
      setClickHouseQueryTagTestFallbackForTests(true);
    }
  });

  it("uses fallback tags for direct ClickHouse calls in tests", () => {
    const logComment = buildClickHouseLogComment(undefined as never);

    expect(JSON.parse(logComment)).toEqual({
      tag_schema_version: "1",
      surface: "worker",
      route: "vitest",
      feature: "custom-query",
    });
  });

  it("uses fallback tags under Vitest even when NODE_ENV is not test", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITEST", "true");

    try {
      const logComment = buildClickHouseLogComment(undefined as never);

      expect(JSON.parse(logComment)).toEqual({
        tag_schema_version: "1",
        surface: "worker",
        route: "vitest",
        feature: "custom-query",
      });
    } finally {
      vi.unstubAllEnvs();
    }
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
