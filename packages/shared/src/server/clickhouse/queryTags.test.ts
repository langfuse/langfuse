import { describe, expect, it } from "vitest";
import { context, propagation } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  buildClickHouseLogComment,
  CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS,
} from "./queryTags";

describe("ClickHouse query tags", () => {
  it("adds experiment attribution without replacing entrypoint or project attribution", () => {
    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable(),
    );
    const entrypoint = propagation.setBaggage(
      context.active(),
      propagation.createBaggage({
        [CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.surface]: { value: "worker" },
        [CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.route]: {
          value: "langfuse.queue.trace_batch",
        },
        [CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.projectId]: {
          value: "producer-project",
        },
      }),
    );
    try {
      const tags = context.with(entrypoint, () =>
        JSON.parse(
          buildClickHouseLogComment({
            projectId: "MULTI_PROJECT",
            experimentId: "arm-b",
          }),
        ),
      );
      expect(tags).toEqual({
        tag_schema_version: "1",
        surface: "worker",
        route: "langfuse.queue.trace_batch",
        projectId: "MULTI_PROJECT",
        experimentId: "arm-b",
      });
    } finally {
      context.disable();
    }
  });
  it("builds v1 log comments from entrypoint context", () => {
    const logComment = buildClickHouseLogComment({
      surface: "publicapi",
      route:
        "GET /api/public/traces/123e4567-e89b-12d3-a456-426614174000?select=full",
      projectId: "project-1",
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
    const logComment = buildClickHouseLogComment();

    expect(JSON.parse(logComment)).toEqual({
      tag_schema_version: "1",
      surface: "unknown",
    });
  });

  it("omits optional route and project id when absent", () => {
    const logComment = buildClickHouseLogComment({
      surface: "publicapi",
    });

    expect(JSON.parse(logComment)).toEqual({
      tag_schema_version: "1",
      surface: "publicapi",
    });
  });
});
