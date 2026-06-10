import { describe, expect, it } from "vitest";

import {
  EventsStringObjectFilterWithTraceFallback,
  FilterList,
  StringObjectFilter,
} from "./clickhouse-filter";
import { EventsQueryBuilder } from "./event-query-builder";
import { eventsTraceMetadataArrays } from "./query-fragments";

const baseMetadataFilter = () =>
  new StringObjectFilter({
    clickhouseTable: "events_proto",
    field: "metadata",
    operator: "contains",
    key: "tenant",
    value: "enterprise",
    tablePrefix: "e",
  });

describe("EventsStringObjectFilterWithTraceFallback", () => {
  it("uses observation metadata first and falls back to trace metadata only when the key is absent", () => {
    const { query, params } = new EventsStringObjectFilterWithTraceFallback({
      baseFilter: baseMetadataFilter(),
      traceMetadataPrefix: "tm",
    }).apply();

    expect(query).toContain("has(e.metadata_names");
    expect(query).toContain("has(tm.metadata_names");
    expect(query).toContain("OR (NOT has(e.metadata_names");
    expect(query).toContain("position(e.metadata_values");
    expect(query).toContain("position(tm.metadata_values");
    expect(Object.values(params)).toEqual(["tenant", "enterprise"]);
  });
});

describe("EventsQueryBuilder trace metadata fallback", () => {
  it("builds an observation query that can filter on trace-level metadata", () => {
    const projectId = "project-1";
    const startTimeFrom = "2026-01-01 00:00:00.000";
    const filter = new EventsStringObjectFilterWithTraceFallback({
      baseFilter: baseMetadataFilter(),
      traceMetadataPrefix: "tm",
    });

    const builder = new EventsQueryBuilder({ projectId })
      .selectFieldSet("count")
      .withCTE(
        "trace_metadata",
        eventsTraceMetadataArrays({ projectId, startTimeFrom }),
      )
      .leftJoin(
        "trace_metadata AS tm",
        "ON tm.trace_id = e.trace_id AND tm.project_id = e.project_id",
      )
      .applyFilters(new FilterList([filter]));

    const { query, params } = builder.buildWithParams();

    expect(query).toContain("WITH trace_metadata AS");
    expect(query).toContain("argMaxIf(metadata_names");
    expect(query).toContain("argMaxIf(metadata_values");
    expect(query).toContain("LEFT JOIN trace_metadata AS tm");
    expect(query).toContain("OR (NOT has(e.metadata_names");
    expect(query).toContain("has(tm.metadata_names");
    expect(query).toContain("INTERVAL 2 DAY");
    expect(params.projectId).toBe(projectId);
    expect(params.startTimeFrom).toBe(startTimeFrom);
    expect(Object.values(params)).toContain("tenant");
    expect(Object.values(params)).toContain("enterprise");
  });
});
