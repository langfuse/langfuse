import * as opentelemetry from "@opentelemetry/api";
import {
  contextWithLangfuseProps,
  normalizeClickHouseQueryTags,
  normalizeClickHouseRoute,
  type ClickHouseQueryTags,
} from "@langfuse/shared/src/server";

describe("ClickHouse query tags", () => {
  it("normalizes explicit event-backed public API tags", () => {
    const tags = normalizeClickHouseQueryTags({
      tags: {
        surface: "public-api",
        feature: "tracing",
        type: "events",
        kind: "publicApiRows",
        projectId: "project-1",
        physical_table: "events_core",
      },
    });

    expect(tags).toMatchObject({
      tag_schema_version: "1",
      surface: "public-api",
      feature: "tracing",
      entity: "event",
      storage: "events",
      workload: "list",
      project_id: "project-1",
      physical_table: "events_core",
      type: "events",
      kind: "publicApiRows",
      projectId: "project-1",
    });
  });

  it("sets safe request baggage and accepts equivalent structured tags", () => {
    const ctx = contextWithLangfuseProps({
      projectId: "project-2",
      clickhouse: {
        surface: "trpc",
        route: "traces.all",
        service: "web",
      },
    });
    const baggage = opentelemetry.propagation.getBaggage(ctx);

    expect(baggage?.getEntry("langfuse.clickhouse.surface")?.value).toBe(
      "trpc",
    );
    expect(baggage?.getEntry("langfuse.clickhouse.route")?.value).toBe(
      "traces.all",
    );
    expect(baggage?.getEntry("langfuse.project.id")?.value).toBe("project-2");

    const tags = normalizeClickHouseQueryTags({
      tags: {
        surface: "trpc",
        route: "traces.all",
        service: "web",
        feature: "tracing",
        type: "trace",
        kind: "count",
        project_id: "project-2",
        storage: "legacy",
        physical_table: "traces",
      },
    });

    expect(tags).toMatchObject({
      surface: "trpc",
      route: "traces.all",
      service: "web",
      entity: "trace",
      storage: "legacy",
      workload: "count",
      project_id: "project-2",
      physical_table: "traces",
    });
  });

  it("normalizes routes and drops forbidden high-cardinality legacy keys", () => {
    const route = normalizeClickHouseRoute(
      "/api/public/traces/018ff0ca-8c03-7d9d-9a89-6cc4d390d6bd?limit=10",
    );
    const tags = normalizeClickHouseQueryTags({
      table: "events_full",
      operation: "insert",
      tags: {
        surface: "worker",
        feature: "ingestion",
        entity: "event",
        project_id: "project-3",
        queryId: "high-cardinality-query-id",
        traceId: "high-cardinality-trace-id",
      } as ClickHouseQueryTags & { queryId: string; traceId: string },
    });

    expect(route).toBe("/api/public/traces/:id");
    expect(tags.queryId).toBeUndefined();
    expect(tags.traceId).toBeUndefined();
    expect(tags).toMatchObject({
      surface: "worker",
      storage: "events",
      workload: "write",
      project_id: "project-3",
      physical_table: "events_full",
    });
  });
});
