import { describe, expect, it } from "vitest";

import { eventsTableTraceNameSql } from "../../eventsTable";
import { compileClickhouseQuery, renderClickhouseExpression } from "./compile";
import { derivedColumnExpression } from "./derived";
import { getClickhouseKysely } from "./dialect";
import { limitBy, useFinal } from "./extensions";

const ctx = { projectId: "p" };

const compile = (query: Parameters<typeof compileClickhouseQuery>[0]) =>
  compileClickhouseQuery(query, ctx).sql;

describe("derived columns", () => {
  it("expands a qualified reference in every clause, keeping the qualifier", () => {
    const db = getClickhouseKysely();
    const query = db
      .selectFrom("events_core as e")
      .select(["e.resolved_trace_name as name"])
      .where("e.resolved_trace_name", "is not", null)
      .groupBy("e.resolved_trace_name")
      .orderBy("e.resolved_trace_name")
      .$call(limitBy({ count: 1, columns: ["e.resolved_trace_name"] }));

    expect(compile(query)).toMatchInlineSnapshot(
      `"select COALESCE(nullIf(e.trace_name, ''), if((e.parent_span_id = '' or e.is_app_root = true), nullIf(e.name, ''), null)) as name from events_core as e where e.project_id = {p1:String} and COALESCE(nullIf(e.trace_name, ''), if((e.parent_span_id = '' or e.is_app_root = true), nullIf(e.name, ''), null)) is not null group by COALESCE(nullIf(e.trace_name, ''), if((e.parent_span_id = '' or e.is_app_root = true), nullIf(e.name, ''), null)) order by COALESCE(nullIf(e.trace_name, ''), if((e.parent_span_id = '' or e.is_app_root = true), nullIf(e.name, ''), null)) limit 1 by COALESCE(nullIf(e.trace_name, ''), if((e.parent_span_id = '' or e.is_app_root = true), nullIf(e.name, ''), null))"`,
    );
  });

  it("names an unaliased selection after the derived column", () => {
    const db = getClickhouseKysely();
    const query = db.selectFrom("events_core as e").select("e.metadata");

    expect(compile(query)).toMatchInlineSnapshot(
      `"select mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values)) as metadata from events_core as e where e.project_id = {p1:String}"`,
    );
  });

  it("expands an unqualified reference over the only relation, unqualified", () => {
    const db = getClickhouseKysely();
    const query = db
      .selectFrom("events_core")
      .select("metadata")
      .orderBy("metadata");

    expect(compile(query)).toMatchInlineSnapshot(
      `"select mapFromArrays(arrayReverse(metadata_names), arrayReverse(metadata_values)) as metadata from events_core where project_id = {p1:String} order by mapFromArrays(arrayReverse(metadata_names), arrayReverse(metadata_values))"`,
    );
  });

  it("expands an unqualified reference that a same-named column alias repeats", () => {
    const db = getClickhouseKysely();
    const query = db
      .selectFrom("events_core as e")
      .select("e.metadata as metadata")
      .orderBy("metadata");

    expect(compile(query)).toMatchInlineSnapshot(
      `"select mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values)) as metadata from events_core as e where e.project_id = {p1:String} order by mapFromArrays(arrayReverse(metadata_names), arrayReverse(metadata_values))"`,
    );
  });

  it("expands an outer relation's column inside a correlated subquery", () => {
    const db = getClickhouseKysely();
    const query = db
      .selectFrom("events_core as e")
      .select((eb) => [
        eb
          .selectFrom("scores as s")
          .select("s.id")
          .whereRef("s.name", "=", "e.resolved_trace_name")
          .limit(1)
          .as("score_id"),
      ]);

    expect(compile(query)).toMatchInlineSnapshot(
      `"select (select s.id from scores as s where s.project_id = {p1:String} and s.name = COALESCE(nullIf(e.trace_name, ''), if((e.parent_span_id = '' or e.is_app_root = true), nullIf(e.name, ''), null)) limit {p2:Int64}) as score_id from events_core as e where e.project_id = {p1:String}"`,
    );
  });

  it("resolves a qualifier to the innermost relation, FINAL included", () => {
    const db = getClickhouseKysely();
    const query = db.selectFrom("events_core as e").select((eb) => [
      eb
        .selectFrom("scores as e")
        .select("e.metadata")
        .$call(useFinal(["scores"]))
        .limit(1)
        .as("score_metadata"),
    ]);

    expect(compile(query)).toMatchInlineSnapshot(
      `"select (select e.metadata from scores as e final where e.project_id = {p1:String} limit {p2:Int64}) as score_metadata from events_core as e where e.project_id = {p1:String}"`,
    );
  });

  it("leaves a CTE's output column alone and expands inside the CTE body", () => {
    const db = getClickhouseKysely();
    const query = db
      .with("t", (qb) =>
        qb.selectFrom("events_core as e").select("e.metadata as metadata"),
      )
      .selectFrom("t")
      .select("t.metadata");

    expect(compile(query)).toMatchInlineSnapshot(
      `"with t as (select mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values)) as metadata from events_core as e where e.project_id = {p1:String}) select t.metadata from t"`,
    );
  });

  it("leaves a CTE named like a registry table alone", () => {
    const db = getClickhouseKysely();
    const query = db
      .with("events_core", (qb) =>
        qb.selectFrom("events_full as f").select("f.metadata as metadata"),
      )
      .selectFrom("events_core")
      .select("metadata");

    expect(compile(query)).toMatchInlineSnapshot(
      `"with events_core as (select mapFromArrays(arrayReverse(f.metadata_names), arrayReverse(f.metadata_values)) as metadata from events_full as f where f.project_id = {p1:String}) select metadata from events_core"`,
    );
  });

  it("leaves a FROM subquery's output column alone", () => {
    const db = getClickhouseKysely();
    const query = db
      .selectFrom((eb) =>
        eb
          .selectFrom("events_core as e")
          .select("e.metadata as metadata")
          .as("s"),
      )
      .select("s.metadata");

    expect(compile(query)).toMatchInlineSnapshot(
      `"select s.metadata from (select mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values)) as metadata from events_core as e where e.project_id = {p1:String}) as s"`,
    );
  });

  it("rejects an unqualified reference with another relation in scope", () => {
    const db = getClickhouseKysely();
    const query = db
      .selectFrom("events_core as e")
      .innerJoin("scores as s", "s.trace_id", "e.trace_id")
      .select("metadata");

    expect(() => compile(query)).toThrow(/ambiguous/);
  });

  it("rejects an unqualified reference on a self-join", () => {
    const db = getClickhouseKysely();
    const query = db
      .selectFrom("events_core as a")
      .innerJoin("events_core as b", "a.span_id", "b.span_id")
      .select("resolved_trace_name");

    expect(() => compile(query)).toThrow(/ambiguous/);
  });

  it("rejects an unqualified reference shadowed by another expression's alias", () => {
    const db = getClickhouseKysely();
    const query = db
      .selectFrom("events_core as e")
      .select("e.name as resolved_trace_name")
      .orderBy("resolved_trace_name");

    expect(() => compile(query)).toThrow(/shadowed/);
  });

  it("renders the trace name exactly as the raw-SQL builders write it", () => {
    const normalize = (sql: string) => sql.toLowerCase().replace(/\s+/g, " ");
    expect(
      normalize(
        renderClickhouseExpression(
          derivedColumnExpression("events_core", "resolved_trace_name", "e"),
        ),
      ),
    ).toBe(normalize(eventsTableTraceNameSql));
  });
});
