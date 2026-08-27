import { describe, expect, expectTypeOf, it } from "vitest";

import { compile } from "./compile";
import { table } from "./db";
import { TypeIncompatibleTransformationError } from "./executionContext";
import { selectPlan } from "./plan";
import type { LangfuseClickHouseSchema } from "./schema";

const CTX = { projectId: "golden-project" };

describe("condition 7: schema-typed selection and transformation", () => {
  it("rejects DateTime vs Int at the TS layer (DateTime64 infers as string)", () => {
    // @ts-expect-error start_time is DateTime64 → string; number is not assignable
    const rejected = table("events_core").where("start_time", "eq", 123);
    expect(rejected).toBeDefined();
  });

  it("type-checks and compiles a numeric aggregation", () => {
    const plan = selectPlan(
      table("events_core").select(["environment"]).sum("is_deleted", "deleted"),
    );
    const compiled = compile(plan, CTX);
    expect(compiled.sql).toContain("SUM(is_deleted) AS deleted");
    expect(compiled.sql).toContain("project_id = {projectId:String}");
  });

  it("does not reject sum() over String at the TS layer (SelectableColumn)", () => {
    const builder = table("events_core").sum("environment", "bad");
    expect(builder.getQueryNode().select?.[0]?.selection).toMatch(
      /SUM\(environment\)/i,
    );
  });

  it("rejects sum() over String at the compile validation pass", () => {
    expect(() =>
      compile(table("events_core").sum("environment", "bad"), CTX),
    ).toThrow(TypeIncompatibleTransformationError);
  });

  it("gives column-name autocomplete from the traced schema", () => {
    type EventsColumns = keyof LangfuseClickHouseSchema["events_core"];
    type HasEnvironment = "environment" extends EventsColumns ? true : false;
    expectTypeOf<HasEnvironment>().toEqualTypeOf<true>();
    // @ts-expect-error not a physical column on events_core
    const rejected = table("events_core").select(["not_a_column"]);
    expect(rejected).toBeDefined();
  });
});
