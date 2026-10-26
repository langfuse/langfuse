import { expressionBuilder, sql, type ExpressionBuilder } from "kysely";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  compileClickhouseQuery,
  renderClickhouseExpression,
  renderClickhouseSelections,
} from "./compile";
import { getClickhouseKysely } from "./dialect";
import {
  QueryCompileError,
  TypeCompatibilityError,
  UnscopedRelationError,
} from "./errors";
import {
  arrayExists,
  arrayLength,
  arrayMap,
  count,
  countIf,
  latestNonEmpty,
  leftUTF8,
  literal,
  mapValue,
  medianExact,
  metadataMap,
  metadataValue,
  startsWith,
  uniq,
  uniqIf,
} from "./extensions";
import { ArrayIndexNode } from "./nodes";
import type { ClickHouseDatabase } from "./schema";
import { TenancyInjectionPlugin } from "./tenancy";
import { defineView, fromView } from "./views";

const projectId = "proj-1";

const eventsMetadata = (
  eb: ExpressionBuilder<{ e: ClickHouseDatabase["events"] }, "e">,
  key: string,
) =>
  metadataValue(eb.ref("e.metadata_names"), eb.ref("e.metadata_values"), key);

describe("schema-typed selection (condition 7)", () => {
  it("accepts sum() over a numeric column and emits SQL", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events")
      .select((eb) => [eb.fn.sum("total_cost").as("s")]);

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    expect(compiled.toLowerCase()).toContain("sum(total_cost)");
    expect(compiled.toLowerCase()).toContain("project_id");
  });

  it("rejects sum() over a String column at the runtime validation pass", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events")
      .select((eb) => [eb.fn.sum("environment").as("s")]);

    expect(() => compileClickhouseQuery(qb, projectId)).toThrow(
      TypeCompatibilityError,
    );
    expect(() => compileClickhouseQuery(qb, projectId)).toThrow(/environment/);
  });

  it("does not type a column named like an Object prototype key", () => {
    // `constructor` is no registry column, so the pass has no type to reject.
    const db = getClickhouseKysely();
    const qb = db
      .selectFrom("scores")
      .select((eb) => [eb.fn.sum(db.dynamic.ref("constructor")).as("s")]);

    expect(() => compileClickhouseQuery(qb, projectId)).not.toThrow();
  });
});

describe("metadata subscript access (condition 7b)", () => {
  // These tests use a two-layer strategy. This first test inspects the AST
  // itself (serialized to JSON) to prove `metadata[key]` is *lowered* to real
  // operation nodes — an `ArrayIndexNode` subscript over a `mapFromArrays(...)`
  // `FunctionNode` — and never a `RawNode` (a raw SQL string). The sibling
  // tests below assert the SQL the compiler then emits. Separating them
  // isolates "the builder produced the right tree" (composable, escaped,
  // parameter-bound) from "the compiler rendered that tree correctly".
  it("lowers metadata[key] to ArrayIndexNode + mapFromArrays FunctionNode, not RawNode", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events as e")
      .select((eb) => [eventsMetadata(eb, "a").as("a")])
      .where((eb) => eb(eventsMetadata(eb, "a"), "=", "x"));

    const node = qb
      .withPlugin(new TenancyInjectionPlugin(projectId))
      .toOperationNode();
    const json = JSON.stringify(node);
    expect(json).toContain('"kind":"ArrayIndexNode"');
    expect(json).toContain('"func":"mapFromArrays"');
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
      .selectFrom("events as e")
      .select((eb) => [eventsMetadata(eb, "a").as("a")])
      .where((eb) => eb(eventsMetadata(eb, "a"), "=", "x"));

    const { sql: compiled, params } = compileClickhouseQuery(qb, projectId);
    const lower = compiled.toLowerCase();
    expect(lower).toContain(
      "mapfromarrays(arrayreverse(e.metadata_names), arrayreverse(e.metadata_values))[",
    );
    expect(lower).toContain("as a");
    expect(Object.values(params)).toContain("a");
    expect(Object.values(params)).toContain("x");
    expect(compiled).not.toMatch(/\['a'\]/);
  });

  it("emits the same lowering in HAVING", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events as e")
      .select("environment")
      .groupBy("environment")
      .having((eb) => eb(eventsMetadata(eb, "a"), "=", "x"));

    const { sql: compiled, params } = compileClickhouseQuery(qb, projectId);
    expect(compiled.toLowerCase()).toContain("having");
    expect(compiled.toLowerCase()).toContain(
      "mapfromarrays(arrayreverse(e.metadata_names), arrayreverse(e.metadata_values))[",
    );
    expect(Object.values(params)).toContain("a");
  });

  // The routing pass keeps a short metadata `=` / `startsWith` on events_core
  // by trusting the lookup's marker, so the lookup may only read the metadata
  // columns of one relation.
  describe("rejects a lookup over anything but one relation's metadata columns", () => {
    const eb = expressionBuilder<{ e: ClickHouseDatabase["events"] }, "e">();
    it.each([
      // Any expression, not only `input`: the pass doesn't walk the
      // arguments, so a column inside `values` would escape routing.
      [
        "an expression as values",
        () =>
          metadataValue(
            eb.ref("e.metadata_names"),
            arrayMap<string, string>(
              () => eb.ref("e.input"),
              eb.ref("e.metadata_names"),
            ),
            "k",
          ),
      ],
      // Unqualified, the pass can't resolve which relation it reads.
      [
        "unqualified columns",
        () =>
          metadataValue(
            eb.ref("metadata_names"),
            eb.ref("metadata_values"),
            "k",
          ),
      ],
      // Swapped, the map's keys would be the values.
      [
        "swapped columns",
        () =>
          metadataValue(
            eb.ref("e.metadata_values"),
            eb.ref("e.metadata_names"),
            "k",
          ),
      ],
    ])("%s", (_, build) => {
      expect(build).toThrow(QueryCompileError);
    });

    it("rejects names and values from two relations", () => {
      const joined = expressionBuilder<
        {
          e: ClickHouseDatabase["events"];
          f: ClickHouseDatabase["events"];
        },
        "e" | "f"
      >();
      expect(() =>
        metadataValue(
          joined.ref("e.metadata_names"),
          joined.ref("f.metadata_values"),
          "k",
        ),
      ).toThrow(QueryCompileError);
    });
  });
});

describe("virtual view (condition 8)", () => {
  const environmentsView = defineView("environments_view")<{
    environment: string;
  }>(() =>
    getClickhouseKysely().selectFrom("events").select("environment").distinct(),
  );

  it("treats the view as a table and emits a WITH CTE", () => {
    const qb = fromView(environmentsView)
      .select("environment")
      .where("environment", "=", "production");

    const { sql: compiled, params } = compileClickhouseQuery(qb, projectId);
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
    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
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

describe("leftUTF8", () => {
  it("inlines a positive integer length", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events as e")
      .select((eb) => [leftUTF8(eb.ref("e.input"), 100).as("input")]);

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    expect(compiled).toContain("leftUTF8(e.input, 100)");
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects length %s", (length) => {
    expect(() =>
      getClickhouseKysely()
        .selectFrom("events as e")
        .select((eb) => [leftUTF8(eb.ref("e.input"), length).as("input")]),
    ).toThrow(QueryCompileError);
  });
});

describe("arrayMap", () => {
  it("names nested lambda parameters apart so the inner one does not shadow", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events as e")
      .select((eb) => [
        arrayMap<string, string[]>(
          (name) =>
            arrayMap<string, string>(
              (tag) => eb.fn<string>("concat", [name, tag]),
              eb.ref("e.tags"),
            ),
          eb.ref("e.metadata_names"),
        ).as("nested"),
        arrayMap<string, string>(
          (value) => leftUTF8(value, 2),
          eb.ref("e.tags"),
        ).as("sibling"),
      ]);

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    expect(compiled).toContain(
      "arrayMap(v -> arrayMap(v1 -> concat(v, v1), e.tags), e.metadata_names)",
    );
    expect(compiled).toContain("arrayMap(v -> leftUTF8(v, 2), e.tags)");
  });
});

describe("arrayExists", () => {
  it("names nested lambda parameters apart so the inner one does not shadow", () => {
    const eb = expressionBuilder<{ e: ClickHouseDatabase["events"] }, "e">();
    const nested = arrayExists<string>(
      (name) =>
        arrayExists<string>((tag) => eb(tag, "=", name), eb.ref("e.tags")),
      eb.ref("e.metadata_names"),
    );

    expect(renderClickhouseExpression(nested)).toBe(
      "arrayExists(x -> arrayExists(x1 -> x1 = x, e.tags), e.metadata_names)",
    );
  });
});

describe("renderClickhouseExpression", () => {
  const eb = expressionBuilder<{ e: ClickHouseDatabase["events"] }, "e">();
  const metadata = metadataMap(
    eb.ref("e.metadata_names"),
    eb.ref("e.metadata_values"),
  );

  it("renders a typed expression as the SQL the compiler emits inline", () => {
    expect(renderClickhouseExpression(metadata)).toBe(
      "mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values))",
    );
    expect(
      renderClickhouseExpression(
        latestNonEmpty(eb.ref("session_id"), eb.ref("event_ts")),
      ),
    ).toBe("argMaxIf(session_id, event_ts, session_id != '')");
  });

  it("rejects a subquery", () => {
    const subquery = getClickhouseKysely()
      .selectFrom("events")
      .select("trace_id");
    expect(() => renderClickhouseExpression(subquery)).toThrow(
      UnscopedRelationError,
    );
  });

  it("rejects a raw fragment that introduces a relation", () => {
    expect(() =>
      renderClickhouseExpression(sql`(select trace_id from events_core)`),
    ).toThrow(UnscopedRelationError);
  });

  it("rejects a bound value", () => {
    expect(() => renderClickhouseExpression(mapValue(metadata, "key"))).toThrow(
      /cannot bind parameters/,
    );
  });
});

describe("renderClickhouseSelections", () => {
  const events = getClickhouseKysely().selectFrom("events as e");

  it("keys each select by its output name, in select order", () => {
    const rendered = renderClickhouseSelections(
      events.select((eb) => [
        "e.span_id as id",
        "e.trace_id",
        eb.fn.min("e.start_time").as("start"),
      ]),
    );
    expect(Object.entries(rendered)).toEqual([
      ["id", "e.span_id as id"],
      ["trace_id", "e.trace_id"],
      ["start", "min(e.start_time) as start"],
    ]);
    expectTypeOf(rendered).toEqualTypeOf<
      Record<"id" | "trace_id" | "start", string>
    >();
  });

  it("keys an output name that is also an Object prototype key", () => {
    expect(
      renderClickhouseSelections(
        events.select((eb) => eb.ref("e.trace_id").as("constructor")),
      ),
    ).toEqual({ constructor: "e.trace_id as constructor" });
  });

  it("rejects a select without an output name", () => {
    expect(() => renderClickhouseSelections(events.selectAll())).toThrow(
      QueryCompileError,
    );
  });

  it("rejects two selects with one output name", () => {
    expect(() =>
      renderClickhouseSelections(
        events.select((eb) => [
          "e.trace_id",
          eb.ref("e.span_id").as("trace_id"),
        ]),
      ),
    ).toThrow(/share the output name "trace_id"/);
  });

  it("rejects a select containing a subquery", () => {
    expect(() =>
      renderClickhouseSelections(
        events.select((eb) =>
          eb.selectFrom("events as x").select("x.trace_id").as("t"),
        ),
      ),
    ).toThrow(UnscopedRelationError);
  });
});

describe("64-bit results", () => {
  const eb = expressionBuilder<{ e: ClickHouseDatabase["events"] }, "e">();
  const isError = eb("e.level", "=", literal("ERROR"));

  // ClickHouse 25.8+ (Langfuse v4 needs 25.12) sends (U)Int64 as JSON numbers.
  it("types count and length results as number", () => {
    expectTypeOf(count().expressionType).toEqualTypeOf<number | undefined>();
    expectTypeOf(countIf(isError).expressionType).toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf(uniq(eb.ref("e.trace_id")).expressionType).toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf(
      uniqIf(eb.ref("e.trace_id"), isError).expressionType,
    ).toEqualTypeOf<number | undefined>();
    expectTypeOf(arrayLength(eb.ref("e.tags")).expressionType).toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf(
      medianExact(eb.ref("e.total_cost")).expressionType,
    ).toEqualTypeOf<number | undefined>();
  });
});

describe("literal", () => {
  it("inlines a string with its quotes doubled", () => {
    expect(renderClickhouseExpression(literal("it's"))).toBe("'it''s'");
  });

  it("rejects a backslash, which ClickHouse reads as an escape", () => {
    expect(() => literal("a\\")).toThrow(QueryCompileError);
  });
});

describe("startsWith", () => {
  it("binds a string prefix and inlines a literal one", () => {
    const { sql, params } = compileClickhouseQuery(
      getClickhouseKysely()
        .selectFrom("events as e")
        .select("e.span_id")
        .where((eb) => startsWith(eb.ref("e.name"), "caller"))
        .where((eb) => startsWith(eb.ref("e.user_id"), literal("const"))),
      projectId,
    );
    expect(sql).toMatch(/startsWith\(e\.name, \{p\d+:String\}\)/);
    expect(sql).toContain("startsWith(e.user_id, 'const')");
    expect(Object.values(params)).toContain("caller");
  });
});
