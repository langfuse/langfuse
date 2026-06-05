import * as opentelemetry from "@opentelemetry/api";
import {
  contextWithLangfuseProps,
  normalizeClickHouseQueryTags,
  normalizeClickHouseRoute,
  type ClickHouseQueryTags,
} from "@langfuse/shared/src/server";

describe("ClickHouse query tags", () => {
  it("normalizes legacy event-backed public API tags into the concise schema", () => {
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
      v: "1",
      project_id: "project-1",
      source: "public-api",
      feature: "tracing",
      query: "public-api.tracing.events.publicApiRows",
      operation: "list",
      storage: "events",
      table: "events_core",
    });
    expect(tags.surface).toBeUndefined();
    expect(tags.entity).toBeUndefined();
    expect(tags.workload).toBeUndefined();
    expect(tags.physical_table).toBeUndefined();
    expect(tags.type).toBeUndefined();
    expect(tags.kind).toBeUndefined();
    expect(tags.projectId).toBeUndefined();
  });

  it("sets safe request baggage and accepts equivalent structured tags", () => {
    const ctx = contextWithLangfuseProps({
      projectId: "project-2",
      clickhouse: {
        source: "trpc",
        route: "traces.all",
      },
    });
    const baggage = opentelemetry.propagation.getBaggage(ctx);

    expect(baggage?.getEntry("langfuse.clickhouse.source")?.value).toBe("trpc");
    expect(baggage?.getEntry("langfuse.clickhouse.route")?.value).toBe(
      "traces.all",
    );
    expect(baggage?.getEntry("langfuse.project.id")?.value).toBe("project-2");

    const tags = normalizeClickHouseQueryTags({
      tags: {
        source: "trpc",
        route: "traces.all",
        feature: "tracing",
        query: "trpc.traces.count",
        operation: "count",
        project_id: "project-2",
        storage: "legacy",
        table: "traces",
      },
    });

    expect(tags).toMatchObject({
      source: "trpc",
      project_id: "project-2",
      feature: "tracing",
      query: "trpc.traces.count",
      operation: "count",
      route: "traces.all",
      storage: "legacy",
      table: "traces",
    });
  });

  it("normalizes routes and drops forbidden high-cardinality legacy keys", () => {
    const route = normalizeClickHouseRoute(
      "/api/public/traces/018ff0ca-8c03-7d9d-9a89-6cc4d390d6bd?limit=10",
    );
    const tags = normalizeClickHouseQueryTags({
      table: "events_full",
      clickhouseOperation: "insert",
      tags: {
        source: "worker",
        feature: "ingestion",
        query: "ingestion.write-events",
        project_id: "project-3",
        queryId: "high-cardinality-query-id",
        traceId: "high-cardinality-trace-id",
      } as ClickHouseQueryTags & { queryId: string; traceId: string },
    });

    expect(route).toBe("/api/public/traces/:id");
    expect(tags.queryId).toBeUndefined();
    expect(tags.traceId).toBeUndefined();
    expect(tags).toMatchObject({
      v: "1",
      source: "worker",
      feature: "ingestion",
      query: "ingestion.write-events",
      operation: "write",
      storage: "events",
      project_id: "project-3",
      table: "events_full",
    });
  });
});
