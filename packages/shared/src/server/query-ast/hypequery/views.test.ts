import { describe, expect, it } from "vitest";

import { compile } from "./compile";
import { table } from "./db";
import { ViewColumnError } from "./executionContext";
import { buildTracingEnvironmentsPlan } from "./environmentsQuery";
import { defineView, fromView } from "./views";

const CTX = { projectId: "golden-project" };

describe("condition 8: virtual view as a black-box relation", () => {
  const envView = defineView(
    "project_environments",
    buildTracingEnvironmentsPlan({ writeMode: "events_only" }),
    ["environment"] as const,
  );

  it("compiles an outer query over the view's exposed columns only", () => {
    const compiled = compile(
      fromView(envView)
        .select(["environment"])
        .where("environment", "neq", "default")
        .toPlan(),
      CTX,
    );

    expect(compiled.sql).toMatch(
      /WITH project_environments AS \([\s\S]*SELECT DISTINCT environment[\s\S]*FROM events_core[\s\S]*\)/i,
    );
    expect(compiled.sql).toContain(
      "SELECT environment\nFROM project_environments",
    );
    expect(compiled.sql).toContain("environment != {environment:String}");
    expect(compiled.params.projectId).toBe(CTX.projectId);
    expect(compiled.params.environment).toBe("default");
  });

  it("still injects tenancy on the inner catalog scan", () => {
    const compiled = compile(
      fromView(envView).select(["environment"]).toPlan(),
      CTX,
    );
    expect(compiled.sql).toContain("project_id = {projectId:String}");
    expect(compiled.sql).toMatch(
      /WITH project_environments AS \([\s\S]*project_id = \{projectId:String\}[\s\S]*\)[\s\S]*FROM project_environments/i,
    );
  });

  it("refuses unscoped compile of a view query", () => {
    expect(() =>
      compile(fromView(envView).select(["environment"]).toPlan(), {
        projectId: "",
      }),
    ).toThrow(/unscoped/i);
  });

  it("rejects a column the view does not expose (runtime + types)", () => {
    expect(() =>
      fromView(envView).where(
        // @ts-expect-error project_id is an inner column, not exposed
        "project_id",
        "eq",
        "x",
      ),
    ).toThrow(ViewColumnError);
  });

  it("hypequery withCTE stringifies via toSQL and skips tenancy — why this arm wraps", () => {
    const inner = table("events_core").select(["environment"]).distinct();
    const withCte = table("events_core")
      .select(["environment"])
      .withCTE("project_environments", inner);
    const raw = withCte.toSQL();
    expect(raw.toLowerCase()).toContain("with");
    expect(raw.toLowerCase()).toContain("project_environments");
    expect(raw).not.toContain("project_id");
  });
});
