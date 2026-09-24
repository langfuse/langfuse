import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { TypeCompatibilityError } from "./errors";
import { metadataValue } from "./extensions";
import { ArrayIndexNode } from "./nodes";
import { TenancyInjectionPlugin } from "./tenancy";
import { defineView, fromView } from "./views";

const ctx = { projectId: "proj-1" };

describe("schema-typed selection (condition 7)", () => {
  it("accepts sum() over a numeric column and emits SQL", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events_core")
      .select((eb) => [eb.fn.sum("total_cost").as("s")]);

    const { sql: compiled } = compileClickhouseQuery(qb, ctx);
    expect(compiled.toLowerCase()).toContain("sum(total_cost)");
    expect(compiled.toLowerCase()).toContain("project_id");
  });

  it("rejects sum() over a String column at the runtime validation pass", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events_core")
      .select((eb) => [eb.fn.sum("environment").as("s")]);

    expect(() => compileClickhouseQuery(qb, ctx)).toThrow(
      TypeCompatibilityError,
    );
    expect(() => compileClickhouseQuery(qb, ctx)).toThrow(/environment/);
  });
});

describe("metadata indexOf access (condition 7b)", () => {
  // These tests use a two-layer strategy. This first test inspects the AST
  // itself (serialized to JSON) to prove `metadata[key]` is *lowered* to real
  // operation nodes — an `ArrayIndexNode` subscript around an `indexOf(...)`
  // `FunctionNode` — and never a `RawNode` (a raw SQL string). The sibling
  // tests below assert the SQL the compiler then emits. Separating them
  // isolates "the builder produced the right tree" (composable, escaped,
  // parameter-bound) from "the compiler rendered that tree correctly".
  it("lowers metadata[key] to ArrayIndexNode + indexOf FunctionNode, not RawNode", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events_core as e")
      .select((_eb) => [metadataValue("e", "a").as("a")])
      .where((eb) => eb(metadataValue("e", "a"), ">", 2));

    const node = qb
      .withPlugin(new TenancyInjectionPlugin(ctx))
      .toOperationNode();
    const json = JSON.stringify(node);
    expect(json).toContain('"kind":"ArrayIndexNode"');
    expect(json).toContain('"func":"indexOf"');
    expect(json).not.toMatch(/"kind":"RawNode"/);

    // `.as("a")` wraps the expression in an AliasNode, so the first selection's
    // inner node must be that AliasNode rather than the bare ArrayIndexNode.
    const selections = (
      node as { selections?: { selection?: { kind: string } }[] }
    ).selections;
    expect(selections?.[0]?.selection?.kind).toBe("AliasNode");
  });

  it("emits subscript + bound key param in SELECT and WHERE", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events_core as e")
      .select((_eb) => [metadataValue("e", "a").as("a")])
      .where((eb) => eb(metadataValue("e", "a"), ">", 2));

    const { sql: compiled, params } = compileClickhouseQuery(qb, ctx);
    const lower = compiled.toLowerCase();
    expect(lower).toContain("metadata_values[indexof(e.metadata_names");
    expect(lower).toContain("as a");
    expect(Object.values(params)).toContain("a");
    expect(Object.values(params)).toContain(2);
    expect(compiled).not.toMatch(/metadata_names,\s*'a'/);
  });

  it("emits the same lowering in HAVING", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events_core as e")
      .select("environment")
      .groupBy("environment")
      .having((eb) => eb(metadataValue("e", "a"), ">", 2));

    const { sql: compiled, params } = compileClickhouseQuery(qb, ctx);
    expect(compiled.toLowerCase()).toContain("having");
    expect(compiled.toLowerCase()).toContain(
      "metadata_values[indexof(e.metadata_names",
    );
    expect(Object.values(params)).toContain("a");
  });
});

describe("virtual view (condition 8)", () => {
  const environmentsView = defineView("environments_view")<{
    environment: string;
  }>(() =>
    getClickhouseKysely()
      .selectFrom("events_core")
      .select("environment")
      .distinct(),
  );

  it("treats the view as a table and emits a WITH CTE", () => {
    const qb = fromView(environmentsView)
      .select("environment")
      .where("environment", "=", "production");

    const { sql: compiled, params } = compileClickhouseQuery(qb, ctx);
    const lower = compiled.toLowerCase();
    expect(lower).toContain("with environments_view as");
    expect(lower).toContain("from events_core");
    expect(lower).toContain("from environments_view");
    expect(lower).toContain("environment =");
    expect(Object.values(params)).toContain("proj-1");
    expect(Object.values(params)).toContain("production");
  });

  it("injects tenancy on the inner physical table, not the view alias", () => {
    const qb = fromView(environmentsView).select("environment");
    const { sql: compiled } = compileClickhouseQuery(qb, ctx);
    const lower = compiled.toLowerCase();
    expect(lower).toMatch(
      /with environments_view as \([\s\S]*project_id[\s\S]*\)[\s\S]*from environments_view/,
    );
    const afterView = lower.split("from environments_view")[1] ?? "";
    expect(afterView).not.toContain("project_id");
  });
});

describe("ArrayIndexNode identity", () => {
  it("is a real node kind", () => {
    expect(
      ArrayIndexNode.is(
        ArrayIndexNode.create(
          {
            kind: "ColumnNode",
            column: { kind: "IdentifierNode", name: "x" },
          } as never,
          { kind: "ValueNode", value: 1 } as never,
        ),
      ),
    ).toBe(true);
  });
});
