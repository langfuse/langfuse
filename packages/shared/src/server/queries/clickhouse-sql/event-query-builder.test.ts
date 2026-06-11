import { describe, expect, it } from "vitest";

import {
  buildEventsFullTableSubqueryQuery,
  EventsQueryBuilder,
} from "./event-query-builder";

describe("buildEventsFullTableSubqueryQuery", () => {
  const buildInner = () =>
    new EventsQueryBuilder({ projectId: "test-project" })
      .whereRaw("e.trace_id = {traceId: String}", { traceId: "trace-1" })
      .orderByColumns([
        { column: "e.start_time", direction: "DESC" },
        { column: "xxHash32(e.trace_id)", direction: "DESC" },
        { column: "e.span_id", direction: "DESC" },
      ])
      .limit(51, undefined);

  it("compiles the full query", () => {
    const { query, params } = buildEventsFullTableSubqueryQuery({
      projectId: "test-project",
      innerBuilder: buildInner(),
      fieldSetNames: ["core", "io"],
    }).buildWithParams();

    expect(query).toMatchInlineSnapshot(`
      "SELECT
        e.span_id as id,
        e.trace_id as "trace_id",
        e.start_time as "start_time",
        e.end_time as "end_time",
        e.project_id as "project_id",
        e.parent_span_id as "parent_observation_id",
        e.type as type,
        e.input,
        e.output
      FROM events_full e
      WHERE e.project_id = {projectId: String}
        AND (e.span_id, e.trace_id, e.start_time, e.project_id) IN (
      SELECT
        e.span_id,
        e.trace_id,
        e.start_time,
        e.project_id
      FROM events_core e
      WHERE e.project_id = {projectId: String}
        AND e.trace_id = {traceId: String}
      ORDER BY e.project_id DESC, toStartOfMinute(e.start_time) DESC, e.start_time DESC, xxHash32(e.trace_id) DESC, e.span_id DESC
      LIMIT {limit: Int32}
      )
      ORDER BY e.project_id DESC, toStartOfMinute(e.start_time) DESC, e.start_time DESC, xxHash32(e.trace_id) DESC, e.span_id DESC
      SETTINGS log_comment = 'observations-v2-subquery-rewrite'"
    `);
    expect(params).toMatchInlineSnapshot(`
      {
        "limit": 51,
        "projectId": "test-project",
        "traceId": "trace-1",
      }
    `);
  });

  it("throws if the inner builder already carries a projection", () => {
    const withFieldSet = buildInner().selectFieldSet("core");
    expect(() =>
      buildEventsFullTableSubqueryQuery({
        projectId: "test-project",
        innerBuilder: withFieldSet,
        fieldSetNames: ["core"],
      }),
    ).toThrow(/without SELECT expressions/);

    const withIO = buildInner().selectIO(false);
    expect(() =>
      buildEventsFullTableSubqueryQuery({
        projectId: "test-project",
        innerBuilder: withIO,
        fieldSetNames: ["core"],
      }),
    ).toThrow(/without SELECT expressions/);
  });
});
