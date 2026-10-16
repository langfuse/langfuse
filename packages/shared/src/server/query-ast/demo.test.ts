import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError, UnscopedRelationError } from "./errors";
import { includeDeleted } from "./extensions";

// Team demo: run with
//   pnpm --filter @langfuse/shared exec vitest run src/server/query-ast/demo.test.ts --silent=false
const projectId = "demo-project";
const db = getClickhouseKysely();

function show(title: string, compiled: { sql: string; params: object }) {
  console.log(
    `\n--- ${title}\n${compiled.sql}\n${JSON.stringify(compiled.params)}`,
  );
}

describe("demo: the compiler owns tenancy, soft-delete and bind types", () => {
  it("adds project_id and is_deleted the call site never wrote", () => {
    const compiled = compileClickhouseQuery(
      db
        .selectFrom("events_core")
        .select(["trace_id", "name"])
        .where("start_time", ">=", new Date("2026-10-01T00:00:00Z"))
        .limit(10),
      projectId,
    );
    show("call site wrote no tenant or soft-delete filter", compiled);

    expect(compiled.sql).toContain("project_id = {p1:String}");
    expect(compiled.sql).toContain("is_deleted = {p2:UInt8}");
    // The Date binds with the column's own ClickHouse type.
    expect(compiled.sql).toContain("{p3:DateTime64(6)}");
  });

  it("makes reading deleted rows an explicit, greppable opt-out", () => {
    const compiled = compileClickhouseQuery(
      db.selectFrom("events_core").select("trace_id").$call(includeDeleted()),
      projectId,
    );
    show("explicit includeDeleted()", compiled);

    expect(compiled.sql).toContain("project_id");
    expect(compiled.sql).not.toContain("is_deleted");
  });
});

describe("demo: unsafe queries do not compile", () => {
  it("rejects a raw SQL table source", () => {
    const query = db
      .selectFrom(sql<{ name: string }>`(SELECT * FROM traces)`.as("t"))
      .selectAll();

    expect(() => compileClickhouseQuery(query, projectId)).toThrow(
      UnscopedRelationError,
    );
  });

  it("rejects a cross-cluster table function", () => {
    const query = db
      .selectFrom((eb) =>
        eb
          .fn<{
            name: string;
          }>("clusterAllReplicas", [eb.val("default"), eb.val("traces")])
          .as("t"),
      )
      .select("t.name");

    expect(() => compileClickhouseQuery(query, projectId)).toThrow(
      UnscopedRelationError,
    );
  });

  it("refuses to compile when the tenancy pass is bypassed", () => {
    const query = db.selectFrom("traces").select("environment");

    expect(() => query.compile()).toThrow(QueryCompileError);
  });
});

// Never called: `tsc` rejects these lines, which is the point.
export function demoTypeErrors() {
  // @ts-expect-error typo in a column name
  db.selectFrom("events_core").select("trce_id");

  db.selectFrom("events_core")
    .select("trace_id")
    // @ts-expect-error DateTime column compared to a number
    .where("start_time", "=", 123);
}
