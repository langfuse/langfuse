import { describe, expect, it } from "vitest";

import { compile, UnscopedQueryError } from "./compile";
import { table } from "./db";
import {
  buildScoreEnvironmentsPlan,
  buildTracingEnvironmentsPlan,
} from "./environmentsQuery";
import { TenantInjectionError } from "./executionContext";

const PROJECT_ID = "golden-project";
const FROM_TS = new Date("2026-01-01T00:00:00.000Z");

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

  it("injects project_id onto joined tenant tables", () => {
    const compiled = compile(
      table("events_core")
        .select(["span_id"])
        .innerJoin("scores", "project_id", "scores.project_id"),
      { projectId: PROJECT_ID },
    );
    expect(compiled.sql).toMatch(/JOIN scores/i);
    expect(compiled.sql).toContain("project_id = {projectId:String}");
    expect(compiled.sql).toContain("scores.project_id = {projectId:String}");
    expect(compiled.params.projectId).toBe(PROJECT_ID);
  });
});
