import { expressionBuilder, type Expression, type SqlBool } from "kysely";
import { describe, expect, it } from "vitest";

import {
  clickhouseLocalAvailable,
  executeClickhouseLocal,
  substituteNamedParams,
} from "../repositories/goldenHarness";
import type { ClickhouseCompilable } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError, UnscopedRelationError } from "./errors";
import { applyPassOnly, renderPassOutput } from "./passHarness";
import type { ClickHouseDatabase } from "./schema";
import { TenancyInjectionPlugin } from "./tenancy";

// The tenancy pass alone, over every join type × FROM table or subquery ×
// joined table left to the pass (ON), scoped by the caller (WHERE), or under
// a caller WHERE that does not scope it. Each shape either
// compiles to SQL that returns only the compiled project's rows or is
// rejected; no other pass runs.

const projectId = "proj-a";
const otherProject = "proj-b";

const JOIN_TYPES = ["inner", "left", "right", "full", "cross"] as const;
const FROM_ITEMS = ["table", "subquery"] as const;
const JOIN_SCOPES = [
  "on",
  "where",
  "where other project",
  "where !=",
  "where or",
  "where other column",
  "where not",
] as const;

type JoinType = (typeof JOIN_TYPES)[number];
type FromItem = (typeof FROM_ITEMS)[number];
type JoinScope = (typeof JOIN_SCOPES)[number];

const SHAPES = JOIN_TYPES.flatMap((join) =>
  FROM_ITEMS.flatMap((from) =>
    JOIN_SCOPES.map((scope) => ({ join, from, scope })),
  ),
);

/**
 * Whether the pass compiles the shape. A cross join has no ON to scope, and a
 * right or full join keeps the joined table's unmatched rows past its ON, so
 * both need the caller's WHERE scope, and a cross join is refused even then.
 */
function isAccepted(join: JoinType, scope: JoinScope): boolean {
  if (join === "cross") return false;
  return isCallerScoped(scope) || join === "inner" || join === "left";
}

/** `traces as t`, or the same columns read through `(select … from traces) as t`. */
function tracesFrom(from: FromItem) {
  const db = getClickhouseKysely();
  return from === "table"
    ? db.selectFrom("traces as t")
    : db.selectFrom(
        db
          .selectFrom("traces")
          .select(["id", "project_id", "environment", "timestamp"])
          .as("t"),
      );
}

/**
 * The caller's WHERE on the joined table: none for `on`, its scope for
 * `where`, and for the rest a condition that does not scope it (another
 * project, another operator, an OR with an unscoped side, another column
 * compared to the project id, the scope negated).
 */
function callerWhere(scope: JoinScope): Expression<SqlBool> | undefined {
  const eb = expressionBuilder<
    { o: ClickHouseDatabase["observations"] },
    "o"
  >();
  switch (scope) {
    case "on":
      return undefined;
    case "where":
      return eb("o.project_id", "=", projectId);
    case "where other project":
      return eb("o.project_id", "=", otherProject);
    case "where !=":
      return eb("o.project_id", "!=", projectId);
    case "where or":
      return eb.or([
        eb("o.project_id", "=", projectId),
        eb("o.trace_id", "=", "t1"),
      ]);
    case "where other column":
      return eb("o.trace_id", "=", projectId);
    case "where not":
      return eb.not(eb("o.project_id", "=", projectId));
  }
}

/** Whether {@link callerWhere} scopes the joined table to the compiled project. */
function isCallerScoped(scope: JoinScope): boolean {
  return scope === "where";
}

/**
 * `select t.project_id as from_project, o.project_id as joined_project from
 * <t> <join> observations as o [on o.trace_id = t.id] [where <callerWhere>]`.
 */
function joinedRead(
  from: FromItem,
  join: JoinType,
  scope: JoinScope,
): ClickhouseCompilable {
  const t = tracesFrom(from);
  const selected = [
    "t.project_id as from_project",
    "o.project_id as joined_project",
  ] as const;
  const where = callerWhere(scope);
  switch (join) {
    case "inner":
      return t
        .innerJoin("observations as o", "o.trace_id", "t.id")
        .select(selected)
        .$call((qb) => (where ? qb.where(where) : qb));
    case "left":
      return t
        .leftJoin("observations as o", "o.trace_id", "t.id")
        .select(selected)
        .$call((qb) => (where ? qb.where(where) : qb));
    case "right":
      return t
        .rightJoin("observations as o", "o.trace_id", "t.id")
        .select(selected)
        .$call((qb) => (where ? qb.where(where) : qb));
    case "full":
      return t
        .fullJoin("observations as o", "o.trace_id", "t.id")
        .select(selected)
        .$call((qb) => (where ? qb.where(where) : qb));
    case "cross":
      return t
        .crossJoin("observations as o")
        .select(selected)
        .$call((qb) => (where ? qb.where(where) : qb));
  }
}

const tenancyOnly = (query: ClickhouseCompilable) =>
  applyPassOnly(query, new TenancyInjectionPlugin(projectId));

describe("tenancy pass alone: join shapes", () => {
  it.each(SHAPES.filter(({ join, scope }) => !isAccepted(join, scope)))(
    "rejects a $join join, FROM $from, joined table under $scope",
    ({ join, from, scope }) => {
      expect(() => tenancyOnly(joinedRead(from, join, scope))).toThrow(
        UnscopedRelationError,
      );
    },
  );

  it.each(SHAPES.filter(({ join, scope }) => isAccepted(join, scope)))(
    "accepts a $join join, FROM $from, joined table under $scope",
    ({ join, from, scope }) => {
      expect(() => tenancyOnly(joinedRead(from, join, scope))).not.toThrow();
    },
  );
});

describe("tenancy pass alone: what it does not scope", () => {
  it("refuses an empty project id", () => {
    expect(() => new TenancyInjectionPlugin("")).toThrow(QueryCompileError);
  });

  it("leaves a CTE read unscoped: its body is scoped where it reads", () => {
    const db = getClickhouseKysely();
    const query = db
      .with("w", () => db.selectFrom("observations").select("trace_id"))
      .selectFrom("w")
      .select("w.trace_id");
    const { sql } = renderPassOutput(tenancyOnly(query));
    expect(sql).not.toContain("w.project_id");
    expect(sql).toContain("observations.project_id = {p1:String}");
  });
});

const describeWithClickhouseLocal = clickhouseLocalAvailable()
  ? describe
  : describe.skip;

if (!clickhouseLocalAvailable()) {
  console.warn(
    "[tenancy] `clickhouse local` unavailable — skipping row-level tenancy checks.",
  );
}

// Both projects hold trace `t1`, so a join on the trace id pairs rows across
// projects unless each side is scoped; `t2` and `t3` exist in the other
// project only. Trace `proj-a` pairs only with the other project's
// observation, which the `where other column` scope matches.
const TENANCY_FIXTURE = `
  CREATE TABLE traces (
    id String,
    project_id String,
    environment String,
    timestamp DateTime64(3)
  ) ENGINE = Memory;
  CREATE TABLE observations (
    trace_id String,
    project_id String
  ) ENGINE = Memory;
  INSERT INTO traces (id, project_id) VALUES
    ('t1', '${projectId}'), ('t1', '${otherProject}'), ('t2', '${otherProject}'),
    ('${projectId}', '${projectId}');
  INSERT INTO observations (trace_id, project_id) VALUES
    ('t1', '${projectId}'), ('t1', '${otherProject}'),
    ('t2', '${otherProject}'), ('t3', '${otherProject}'),
    ('${projectId}', '${otherProject}');
`;

/**
 * Reads of `observations` outside FROM and JOIN, each returning project ids,
 * with the rows each returns once scoped to the compiled project.
 */
const NESTED_READS: [string, () => ClickhouseCompilable, string[][]][] = [
  [
    "an IN subquery",
    // `select 'proj-b' as p where 'proj-b' in (select project_id from observations)`
    () => {
      const db = getClickhouseKysely();
      return db
        .selectNoFrom((eb) => eb.val(otherProject).as("p"))
        .where((eb) =>
          eb(
            eb.val(otherProject),
            "in",
            db.selectFrom("observations").select("observations.project_id"),
          ),
        );
    },
    [],
  ],
  [
    "a scalar subquery",
    // `select (select project_id from observations order by project_id desc limit 1) as p`
    () => {
      const db = getClickhouseKysely();
      return db.selectNoFrom(
        db
          .selectFrom("observations")
          .select("observations.project_id")
          .orderBy("observations.project_id", "desc")
          .limit(1)
          .as("p"),
      );
    },
    [[projectId]],
  ],
  [
    "a CTE body",
    () =>
      getClickhouseKysely()
        .with("w", (qb) =>
          qb.selectFrom("observations").select("observations.project_id"),
        )
        .selectFrom("w")
        .select("w.project_id"),
    [[projectId]],
  ],
  [
    "a JOIN subquery",
    () => {
      const db = getClickhouseKysely();
      return db
        .selectFrom("traces as t")
        .innerJoin(
          db
            .selectFrom("observations")
            .select(["observations.trace_id", "observations.project_id"])
            .as("s"),
          "s.trace_id",
          "t.id",
        )
        .select("s.project_id as p");
    },
    [[projectId]],
  ],
];

/** Each row the SQL returns on the fixture, split into its columns. */
function projectsRead(compiled: {
  sql: string;
  params: Record<string, unknown>;
}): string[][] {
  const output = executeClickhouseLocal(
    `${TENANCY_FIXTURE}\n${substituteNamedParams(compiled.sql, compiled.params)} FORMAT TSV`,
  );
  return output === "" ? [] : output.split("\n").map((row) => row.split("\t"));
}

describeWithClickhouseLocal(
  "tenancy pass alone: rows of other projects",
  () => {
    it("are read by the unscoped fixture query", () => {
      // Without the pass the fixture pairs rows across projects, so the checks
      // below can see a leak.
      const rows = projectsRead(
        renderPassOutput(joinedRead("table", "full", "on").toOperationNode()),
      );
      expect(rows.flat()).toContain(otherProject);
    });

    it.each(SHAPES.filter(({ join, scope }) => isAccepted(join, scope)))(
      "do not survive a $join join, FROM $from, joined table under $scope",
      ({ join, from, scope }) => {
        const rows = projectsRead(
          renderPassOutput(tenancyOnly(joinedRead(from, join, scope))),
        );
        // The matched pair of the compiled project, unless the caller's WHERE
        // filters it out; '' is the default an outer join fills in for the
        // side without a match.
        if (scope === "on" || isCallerScoped(scope)) {
          expect(rows).toContainEqual([projectId, projectId]);
        }
        for (const value of rows.flat()) {
          expect(["", projectId]).toContain(value);
        }
      },
    );

    it.each(NESTED_READS)(
      "do not survive a read of observations in %s",
      (_position, read, scopedRows) => {
        // Unscoped, each read returns the other project's id.
        expect(
          projectsRead(renderPassOutput(read().toOperationNode())).flat(),
        ).toContain(otherProject);
        expect(projectsRead(renderPassOutput(tenancyOnly(read())))).toEqual(
          scopedRows,
        );
      },
    );
  },
);
