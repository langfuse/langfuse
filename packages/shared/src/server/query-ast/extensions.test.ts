import {
  ColumnNode,
  ExpressionWrapper,
  IdentifierNode,
  ReferenceNode,
  TableNode,
  ValueNode,
  expressionBuilder,
  sql,
  type ExpressionBuilder,
} from "kysely";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  compileClickhouseCondition,
  compileClickhouseQuery,
  compilerPasses,
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
  arrayDistinct,
  arrayExists,
  arrayJoinElements,
  arrayLength,
  arrayMap,
  count,
  countIf,
  firstMetadataValue,
  histogram,
  interval,
  latestNonEmpty,
  leftUTF8,
  limitBy,
  literal,
  mapExists,
  mapFilter,
  mapValue,
  medianExact,
  metadataMap,
  metadataSubstringPrefilter,
  metadataTokenPrefilter,
  metadataValue,
  quantile,
  startsWith,
  templateAggregate,
  toDate,
  toFloat64,
  toMonday,
  toStartOfHour,
  toStartOfInterval,
  toStartOfMonth,
  tupleArrayField,
  tupleElement,
  typedValue,
  uniq,
  uniqIf,
  useFinal,
  withFill,
} from "./extensions";
import {
  ArrayIndexNode,
  ParametricAggregateNode,
  asOperationNode,
} from "./nodes";
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

    it.each([
      [
        "the truncated values as the first entry's names",
        () =>
          firstMetadataValue(
            eb.ref("e.metadata_values"),
            eb.ref("e.metadata_values"),
            eb.val("k"),
          ),
      ],
      [
        "another column as the first entry's values",
        () =>
          firstMetadataValue(
            eb.ref("e.metadata_names"),
            eb.ref("e.tags"),
            eb.val("k"),
          ),
      ],
      [
        "another column as a token prefilter's values",
        () => metadataTokenPrefilter(eb.ref("e.tags"), "x", "="),
      ],
      [
        "unqualified values in a substring prefilter",
        () =>
          metadataSubstringPrefilter(
            eb.ref("metadata_values"),
            "x",
            "starts with",
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

  it("reads its key: a truncated column in the key routes the relation to events_full", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events as e")
      .select((eb) => [
        mapValue(eb.ref("e.usage_details"), eb.ref("e.input")).as("usage"),
      ]);

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    expect(compiled).toContain("e.usage_details[e.input] as usage");
    expect(compiled).toContain("from events_full as e");
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

describe("tupleArrayField", () => {
  it("reads a named tuple element as a subcolumn and stays on events_core", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events as e")
      .select((eb) => [
        tupleArrayField(eb.ref("e.skills_available"), "skillName").as("names"),
      ]);

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    expect(compiled).toContain("e.skills_available.skillName as names");
    expect(compiled).toContain("from events_core as e");
  });

  it("reads its column: a truncated one routes the relation to events_full", () => {
    // `input` is truncated on events_core; `withTables` adds an Array(Tuple)
    // type to it so the helper accepts it.
    const qb = getClickhouseKysely()
      .withTables<{ events: { input: Array<{ name: string }> } }>()
      .selectFrom("events as e")
      .select((eb) => [tupleArrayField(eb.ref("e.input"), "name").as("names")]);

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    expect(compiled).toContain("e.input.name as names");
    expect(compiled).toContain("from events_full as e");
  });

  it.each([
    [
      "not a column reference",
      "FunctionNode",
      (eb: ExpressionBuilder<{ e: ClickHouseDatabase["events"] }, "e">) =>
        arrayDistinct(eb.ref("e.skills_available")),
    ],
    [
      "an unqualified column",
      "skills_available",
      (eb: ExpressionBuilder<{ e: ClickHouseDatabase["events"] }, "e">) =>
        eb.ref("skills_available"),
    ],
    [
      "a star",
      "e.*",
      // e.*
      () =>
        new ExpressionWrapper<
          { e: ClickHouseDatabase["events"] },
          "e",
          ClickHouseDatabase["events"]["skills_available"]
        >(ReferenceNode.createSelectAll(TableNode.create("e"))),
    ],
    [
      "a schema-qualified column",
      "default.e.skills_available",
      // default.e.skills_available
      () =>
        new ExpressionWrapper<
          { e: ClickHouseDatabase["events"] },
          "e",
          ClickHouseDatabase["events"]["skills_available"]
        >(
          ReferenceNode.create(
            ColumnNode.create("skills_available"),
            TableNode.createWithSchema("default", "e"),
          ),
        ),
    ],
  ])("rejects %s", (_name, passed, column) => {
    const build = () =>
      getClickhouseKysely()
        .selectFrom("events as e")
        .select((eb) => [tupleArrayField(column(eb), "skillName").as("names")]);
    expect(build).toThrow(QueryCompileError);
    expect(build).toThrow(`, got ${passed}.`);
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

  // Nested parameters get the depth as suffix (`v`, then `v1`), so a custom
  // outer `v1` would be shadowed by the default one level down.
  it("rejects a parameter name ending in a digit", () => {
    const eb = expressionBuilder<{ e: ClickHouseDatabase["events"] }, "e">();
    expect(() =>
      arrayMap<string, string>((tag) => tag, eb.ref("e.tags"), "v1"),
    ).toThrow(/must be a plain identifier that does not end in a digit/);
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

describe("mapExists", () => {
  it("names both parameters per nesting level so inner ones do not shadow", () => {
    const eb = expressionBuilder<{ e: ClickHouseDatabase["events"] }, "e">();
    const nested = mapExists<string>(
      (key) =>
        mapExists<number>(
          (innerKey, innerValue) =>
            eb.and([eb(innerKey, "=", key), eb(innerValue, ">", literal(0))]),
          eb.ref("e.usage_details"),
        ),
      eb.ref("e.tool_definitions"),
    );

    expect(renderClickhouseExpression(nested)).toBe(
      "mapExists((k, v) -> mapExists((k1, v1) -> (k1 = k and v1 > 0), e.usage_details), e.tool_definitions)",
    );
  });

  // `v` is the lambda's value, not the `UInt16` output alias `v`.
  it("binds a body value without the type of a same-named select alias", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events as e")
      .select("e.prompt_version as v")
      .where((eb) =>
        mapExists<number>(
          (_key, value) => eb(value, ">", 1.5),
          eb.ref("e.cost_details"),
        ),
      );

    expect(compileClickhouseQuery(qb, projectId).sql).not.toMatch(/:UInt16\}/);
  });
});

describe("tupleElement", () => {
  const eb = expressionBuilder<{ e: ClickHouseDatabase["events"] }, "e">();

  it("reads a named element of a lambda parameter and of a tuple-array column", () => {
    expect(
      renderClickhouseExpression(
        arrayMap(
          (skill) => tupleElement<string>(skill, "skillName"),
          eb.ref("e.skills_available"),
          "skill",
        ),
      ),
    ).toBe("arrayMap(skill -> skill.skillName, e.skills_available)");
    expect(
      renderClickhouseExpression(
        tupleElement(eb.ref("e.skills_available"), "skillName"),
      ),
    ).toBe("e.skills_available.skillName");
  });

  it("builds a subcolumn of its column: a truncated one routes the relation to events_full", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events as e")
      .select((eb) => [tupleElement(eb.ref("e.input"), "name").as("names")]);

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    expect(compiled).toContain("e.input.name as names");
    expect(compiled).toContain("from events_full as e");
  });

  it("reads a map entry's key in mapFilter by position", () => {
    expect(
      renderClickhouseExpression(
        mapFilter(
          (entry) => eb(tupleElement(entry, "1"), "=", literal("total")),
          eb.ref("e.usage_details"),
        ),
      ),
    ).toBe("mapFilter(x -> x.1 = 'total', e.usage_details)");
  });

  it("rejects anything but a lambda parameter or a qualified column", () => {
    expect(() => tupleElement(eb.ref("skills_available"), "skillName")).toThrow(
      QueryCompileError,
    );
    expect(() => tupleElement(literal("x"), "skillName")).toThrow(
      QueryCompileError,
    );
  });
});

describe("three-part references", () => {
  const events = () => getClickhouseKysely().selectFrom("events as e");

  it.each([
    [
      // Routing would read `input` as the relation, not `e`.
      "a tuple field read in the select list",
      events().select(sql.ref<string>("e.input.name").as("names")),
    ],
    [
      // Rejected by shape alone: tenancy would still scope this join.
      "a project_id predicate on a relation named like a column",
      events()
        .innerJoin(
          "events as skills_available",
          "skills_available.span_id",
          "e.span_id",
        )
        .select("e.span_id")
        .where(sql.ref("e.skills_available.project_id"), "=", projectId),
    ],
  ])("rejects %s", (_name, qb) => {
    expect(() => compileClickhouseQuery(qb, projectId)).toThrow(
      QueryCompileError,
    );
    expect(() => compileClickhouseQuery(qb, projectId)).toThrow(
      /use tupleArrayField\(eb\.ref\("e\.(input|skills_available)"\)/,
    );
  });
});

describe("compileClickhouseCondition", () => {
  const events = () => getClickhouseKysely().selectFrom("events as e");

  it("compiles the WHERE with what tenancy injects, typing binds from the FROM relation", () => {
    expect(
      compileClickhouseCondition(
        events().where("e.prompt_version", "=", 3).where("e.name", "=", "x"),
        projectId,
        "f_",
      ),
    ).toEqual({
      sql: "e.project_id = {f_1:String} and e.prompt_version = {f_2:UInt16} and e.name = {f_3:String}",
      params: { f_1: projectId, f_2: 3, f_3: "x" },
      requiresEventsFull: false,
    });
  });

  // A pass the condition path skipped would leave its effect out of the splice.
  it("runs every compiler pass", () => {
    const spies = compilerPasses(projectId).map((pass) =>
      vi.spyOn(Object.getPrototypeOf(pass), "transformQuery"),
    );
    try {
      compileClickhouseCondition(
        events().where("e.name", "=", "x"),
        projectId,
        "f_",
      );
      for (const spy of spies) expect(spy).toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("rejects sum() over a String column at the runtime validation pass", () => {
    expect(() =>
      compileClickhouseCondition(
        events().where((eb) => eb(eb.fn.sum("e.environment"), ">", 0)),
        projectId,
        "f_",
      ),
    ).toThrow(TypeCompatibilityError);
  });

  it.each([
    ["a truncated column on events", "events as e", true],
    ["a truncated column on events_truncated", "events_truncated as e", true],
  ] as const)(
    "reports the routing verdict for %s",
    (_name, from, requiresEventsFull) => {
      expect(
        compileClickhouseCondition(
          getClickhouseKysely().selectFrom(from).where("e.input", "=", "x"),
          projectId,
          "f_",
        ).requiresEventsFull,
      ).toBe(requiresEventsFull);
    },
  );

  it("rejects a subquery in the condition", () => {
    expect(() =>
      compileClickhouseCondition(
        events().where("e.trace_id", "in", (eb) =>
          eb.selectFrom("traces").select("id"),
        ),
        projectId,
        "f_",
      ),
    ).toThrow(UnscopedRelationError);
  });

  it("rejects raw SQL over the logical events relation", () => {
    expect(() =>
      compileClickhouseCondition(
        events().where(sql<boolean>`e.input = 'x'`),
        projectId,
        "f_",
      ),
    ).toThrow(QueryCompileError);
  });

  // Only the WHERE is emitted, so a select field outside FROM and WHERE, or a
  // FROM item that is not a plain table, would be dropped.
  it.each([
    [
      // Spliced alone, `name` would read the caller's `name` column, not the
      // dropped alias of `e.input`.
      "a select list",
      events()
        .select((eb) => eb.ref("e.input").as("name"))
        .where("name", "=", "x"),
    ],
    [
      // Spliced alone, `c.input = …` would read no CTE, carry no tenancy, and
      // report `events_core` although the CTE body reads `events.input`.
      "a WITH",
      getClickhouseKysely()
        .with("c", (db) => db.selectFrom("events as ev").select("ev.input"))
        .selectFrom("c")
        .where("c.input", "=", "x"),
    ],
    ["a GROUP BY", events().where("e.name", "=", "x").groupBy("e.name")],
    [
      "a HAVING",
      events()
        .where("e.name", "=", "x")
        .groupBy("e.name")
        .having("e.name", "=", "y"),
    ],
    ["an ORDER BY", events().where("e.name", "=", "x").orderBy("e.name")],
    ["a LIMIT", events().where("e.name", "=", "x").limit(1)],
    ["a DISTINCT", events().where("e.name", "=", "x").distinct()],
    [
      "a subquery FROM",
      getClickhouseKysely()
        .selectFrom((db) =>
          db.selectFrom("events as ev").select("ev.name").as("e"),
        )
        .where("e.name", "=", "x"),
    ],
    [
      "a FINAL",
      getClickhouseKysely()
        .selectFrom("scores as s")
        .$call(useFinal(["scores"]))
        .where("s.name", "=", "x"),
    ],
    [
      "a JOIN",
      events()
        .innerJoin("traces as t", "t.id", "e.trace_id")
        .where("e.name", "=", "x"),
    ],
    [
      "a LIMIT BY",
      events()
        .where("e.name", "=", "x")
        .$call(limitBy({ count: 1, columns: (eb) => [eb.ref("e.span_id")] })),
    ],
  ])("rejects a select with %s", (_name, query) => {
    expect(() => compileClickhouseCondition(query, projectId, "f_")).toThrow(
      /emits only the WHERE/,
    );
  });

  it.each([
    ["a prefix that is not a plain identifier", "f-1"],
    ["an empty prefix", ""],
    // `f1` + 1 and `f` + 11 would both name `f11`.
    ["a prefix ending in a digit", "f1"],
  ])("rejects %s", (_name, prefix) => {
    expect(() =>
      compileClickhouseCondition(
        events().where("e.name", "=", "x"),
        projectId,
        prefix,
      ),
    ).toThrow(QueryCompileError);
  });

  it("rejects a select without a WHERE", () => {
    expect(() => compileClickhouseCondition(events(), projectId, "f_")).toThrow(
      /compiles the WHERE/,
    );
  });

  it("keeps a typed value's explicit type", () => {
    expect(
      compileClickhouseCondition(
        events().where((eb) =>
          eb(
            "e.start_time",
            ">",
            typedValue<Date>("2026-01-01 00:00:00.000", "DateTime64(3, 'UTC')"),
          ),
        ),
        projectId,
        "f_",
      ).sql,
    ).toMatch(/e\.start_time > \{f_2:DateTime64\(3, 'UTC'\)\}$/);
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

  it("types a template count or sum as number and any as its value", () => {
    expectTypeOf(
      templateAggregate("count", eb.ref("e.name")).expressionType,
    ).toEqualTypeOf<number | undefined>();
    expectTypeOf(
      templateAggregate("sum", eb.ref("e.total_cost")).expressionType,
    ).toEqualTypeOf<number | undefined>();
    expectTypeOf(
      templateAggregate("any", eb.ref("e.name")).expressionType,
    ).toEqualTypeOf<string | undefined>();
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

describe("parametric aggregates", () => {
  it("inline their parameter before the argument list", () => {
    const { sql: compiled } = compileClickhouseQuery(
      getClickhouseKysely()
        .selectFrom("events as e")
        .select((eb) => [
          quantile(0.95, eb.ref("e.total_cost")).as("p95"),
          histogram(25, toFloat64(eb.ref("e.total_cost"))).as("h"),
        ]),
      projectId,
    );
    expect(compiled).toContain(
      "select quantile(0.95)(e.total_cost) as p95, histogram(25)(toFloat64(e.total_cost)) as h from events_core as e",
    );
  });

  it("read their argument: a truncated column routes the relation to events_full", () => {
    const { sql: compiled } = compileClickhouseQuery(
      getClickhouseKysely()
        .selectFrom("events as e")
        .select((eb) => [quantile(0.5, eb.ref("e.input_length")).as("p50")]),
      projectId,
    );
    expect(compiled).toContain("from events_full as e");
  });

  it("check the function name like any identifier", () => {
    const named = new ExpressionWrapper<ClickHouseDatabase, "events", number>(
      asOperationNode(
        ParametricAggregateNode.create(
          IdentifierNode.create("quantile(0.5)(1), x"),
          [],
          [ValueNode.createImmediate(1)],
        ),
      ),
    );
    expect(() =>
      compileClickhouseQuery(
        getClickhouseKysely()
          .selectFrom("events as e")
          .select([named.as("q")]),
        projectId,
      ),
    ).toThrow(
      'Identifier name "quantile(0.5)(1), x" is not a plain identifier',
    );
  });

  it.each([-0.1, 1.1, Number.NaN])("quantile rejects level %s", (level) => {
    expect(() => quantile(level, literal(1))).toThrow(QueryCompileError);
  });

  it.each([0, 1.5])("histogram rejects %s bins", (bins) => {
    expect(() => histogram(bins, literal(1))).toThrow(QueryCompileError);
  });
});

describe("withFill", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");
  const to = new Date("2026-01-08T00:00:00.000Z");
  const daily = () =>
    getClickhouseKysely()
      .selectFrom("events as e")
      .select((eb) => [toDate(eb.ref("e.start_time")).as("day")])
      .groupBy(sql.ref("day"));

  it("fills the last order by item, before limit by and limit", () => {
    const { sql: compiled } = compileClickhouseQuery(
      daily()
        .orderBy(sql.ref("day"), "asc")
        .$call(
          withFill({
            from: toDate(from),
            to: toDate(to),
            step: interval(1, "day"),
          }),
        )
        .$call(limitBy({ count: 1, columns: () => [sql.ref("day")] }))
        .limit(10),
      projectId,
    );
    expect(compiled).toMatch(
      /order by day asc with fill from toDate\(\{p\d+:DateTime64\(3\)\}\) to toDate\(\{p\d+:DateTime64\(3\)\}\) step toIntervalDay\(1\) limit 1 by day limit \{p\d+:Int64\}$/,
    );
  });

  it("reads its bounds: a truncated column routes the relation to events_full", () => {
    const eb = expressionBuilder<{ e: ClickHouseDatabase["events"] }, "e">();
    const { sql: compiled } = compileClickhouseQuery(
      daily()
        .orderBy(sql.ref("day"), "asc")
        .$call(
          withFill({
            from: eb.ref("e.input_length"),
            to: toDate(to),
            step: interval(1, "day"),
          }),
        ),
      projectId,
    );
    expect(compiled).toContain("from events_full as e");
  });

  it("rejects a select without order by", () => {
    expect(() =>
      compileClickhouseQuery(
        daily().$call(
          withFill({
            from: toDate(from),
            to: toDate(to),
            step: interval(1, "day"),
          }),
        ),
        projectId,
      ),
    ).toThrow("WITH FILL fills the last ORDER BY item");
  });
});

describe("time buckets", () => {
  it("render the bucket of a date column and inline an interval", () => {
    const { sql: compiled } = compileClickhouseQuery(
      getClickhouseKysely()
        .selectFrom("events as e")
        .select((eb) => [
          toStartOfHour(eb.ref("e.start_time")).as("h"),
          toMonday(eb.ref("e.start_time")).as("w"),
          toStartOfMonth(eb.ref("e.start_time")).as("m"),
          toStartOfInterval(eb.ref("e.start_time"), interval(5, "minute")).as(
            "five",
          ),
          arrayJoinElements(eb.ref("e.tags")).as("tag"),
        ]),
      projectId,
    );
    expect(compiled).toContain(
      "select toStartOfHour(e.start_time) as h, toMonday(e.start_time) as w, toStartOfMonth(e.start_time) as m, toStartOfInterval(e.start_time, toIntervalMinute(5)) as five, arrayJoin(e.tags) as tag from",
    );
  });

  it.each([0, 1.5])("interval rejects count %s", (count) => {
    expect(() => interval(count, "day")).toThrow(QueryCompileError);
  });
});
