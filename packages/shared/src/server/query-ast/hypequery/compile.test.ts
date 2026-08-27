import { spawnSync } from "child_process";
import { describe, expect, it } from "vitest";

import { clickhouseFormatAvailable } from "../goldenHarness";
import { compile, UnscopedQueryError } from "./compile";
import { table } from "./db";
import {
  buildScoreEnvironmentsPlan,
  buildTracingEnvironmentsPlan,
} from "./environmentsQuery";
import { TenantInjectionError } from "./executionContext";

const PROJECT_ID = "golden-project";
const FROM_TS = new Date("2026-01-01T00:00:00.000Z");

function bindProjectId(sql: string): string {
  return sql.replaceAll("{projectId:String}", `'${PROJECT_ID}'`);
}

function clickhouseLocal(
  query: string,
  analyzer?: 0 | 1,
): { status: number | null; stderr: string; stdout: string } {
  const input = [
    analyzer === undefined ? "" : `SET enable_analyzer = ${analyzer};`,
    "CREATE TABLE events_core (span_id String, project_id String, environment String) ENGINE = Memory;",
    "CREATE TABLE scores (project_id String, span_id String) ENGINE = Memory;",
    `INSERT INTO events_core VALUES ('s1', '${PROJECT_ID}', 'prod'), ('s2', 'other-project', 'default');`,
    `INSERT INTO scores VALUES ('${PROJECT_ID}', 's1'), ('other-project', 's2');`,
    query,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
  const res = spawnSync("clickhouse", ["local", "--multiquery"], {
    input,
    encoding: "utf8",
  });
  return {
    status: res.status,
    stderr: res.stderr ?? "",
    stdout: res.stdout ?? "",
  };
}

describe("compile choke point", () => {
  it("refuses to compile without ExecutionContext.projectId", () => {
    const builder = table("events_core").select(["environment"]).distinct();
    expect(() => compile(builder, { projectId: "" })).toThrow(
      UnscopedQueryError,
    );
    expect(() => compile(builder, { projectId: "   " })).toThrow(
      UnscopedQueryError,
    );
  });

  it("injects project_id even when the builder never mentioned it", () => {
    const compiled = compile(
      table("events_core").select(["environment"]).distinct(),
      { projectId: PROJECT_ID },
    );
    expect(compiled.sql).toContain("project_id = {projectId:String}");
    expect(compiled.params.projectId).toBe(PROJECT_ID);
    expect(compiled.sql).not.toMatch(
      /project_id = \{projectId:String\}.*project_id = \{projectId:String\}/,
    );
  });

  it("builder.toSQL() bypasses the choke point and emits unscoped SQL", () => {
    const builder = table("events_core").select(["environment"]).distinct();
    const raw = builder.toSQL();
    expect(raw.toLowerCase()).toContain("from events_core");
    expect(raw).not.toContain("project_id");
  });

  it("still injects when a time bound is present", () => {
    const compiled = compile(
      buildTracingEnvironmentsPlan({
        writeMode: "events_only",
        fromTimestamp: FROM_TS,
      }),
      { projectId: PROJECT_ID },
    );
    expect(compiled.sql).toContain("project_id = {projectId:String}");
    expect(compiled.sql).toContain(
      "start_time >= {fromTimestamp:DateTime64(3)}",
    );
    expect(compiled.params.fromTimestamp).toEqual(FROM_TS);
  });

  it("reuses projectId across UNION ALL arms", () => {
    const compiled = compile(
      buildTracingEnvironmentsPlan({ writeMode: "legacy" }),
      { projectId: PROJECT_ID },
    );
    expect(compiled.sql).toMatch(/UNION ALL/i);
    const matches = compiled.sql.match(/\{projectId:String\}/g) ?? [];
    expect(matches.length).toBe(2);
    expect(Object.keys(compiled.params)).toEqual(["projectId"]);
  });

  it("binds listable score types as a single Array(String) param", () => {
    const compiled = compile(buildScoreEnvironmentsPlan(), {
      projectId: PROJECT_ID,
    });
    expect(compiled.sql).toContain("data_type IN ({dataTypes:Array(String)})");
    expect(compiled.params.dataTypes).toEqual([
      "NUMERIC",
      "BOOLEAN",
      "CATEGORICAL",
      "TEXT",
    ]);
  });

  it("throws TenantInjectionError rather than compiling a non-tenant table without a plan", () => {
    expect(() =>
      compile(table("events_core").select(["environment"]), {
        projectId: PROJECT_ID,
      }),
    ).not.toThrow(TenantInjectionError);
  });

  it("parenthesizes a top-level OR so tenancy cannot be bypassed by precedence", () => {
    const compiled = compile(
      table("events_core")
        .select(["span_id"])
        .where("environment", "eq", "prod")
        .orWhere("environment", "eq", "default"),
      { projectId: PROJECT_ID },
    );
    expect(compiled.sql).toMatch(
      /project_id = \{projectId:String\} AND \(environment = \{environment:String\} OR environment = \{environment2:String\}\)/,
    );
  });

  it("qualifies FROM and JOIN columns so two-tenant JOINs are not ambiguous", () => {
    const compiled = compile(
      table("events_core")
        .select(["span_id"])
        .innerJoin("scores", "project_id", "scores.project_id"),
      { projectId: PROJECT_ID },
    );
    expect(compiled.sql).toMatch(/JOIN scores/i);
    expect(compiled.sql).toContain(
      "ON events_core.project_id = scores.project_id",
    );
    expect(compiled.sql).toContain(
      "events_core.project_id = {projectId:String}",
    );
    expect(compiled.sql).toContain("scores.project_id = {projectId:String}");
    expect(compiled.sql).not.toMatch(
      /ON project_id = |WHERE project_id = |AND project_id = /,
    );
    expect(compiled.params.projectId).toBe(PROJECT_ID);
  });

  it.skipIf(!clickhouseFormatAvailable())(
    "executes a two-tenant JOIN on clickhouse local with the old analyzer",
    () => {
      const compiled = compile(
        table("events_core")
          .select(["span_id"])
          .innerJoin("scores", "project_id", "scores.project_id"),
        { projectId: PROJECT_ID },
      );
      const executed = clickhouseLocal(bindProjectId(compiled.sql), 0);
      expect(executed.stderr, executed.stderr).not.toMatch(
        /AMBIGUOUS_COLUMN_NAME|ambiguous/i,
      );
      expect(executed.status, executed.stderr).toBe(0);
      expect(executed.stdout).toContain("s1");
      expect(executed.stdout).not.toContain("s2");
    },
  );

  it("parenthesizes a raw predicate that contains OR", () => {
    const compiled = compile(
      table("events_core")
        .select(["span_id"])
        .where((expr) =>
          expr.raw("environment = 'prod' OR environment = 'default'"),
        ),
      { projectId: PROJECT_ID },
    );
    expect(compiled.sql).toMatch(
      /project_id = \{projectId:String\} AND \(environment = 'prod' OR environment = 'default'\)/,
    );
    expect(compiled.sql).not.toMatch(
      /project_id = \{projectId:String\} AND environment = 'prod' OR environment = 'default'/,
    );
  });
});
