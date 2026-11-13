import { sql, type RawBuilder } from "kysely";
import { describe, expect, it } from "vitest";

import { getClickhouseKysely } from "./dialect";
import { UnscopedRelationError } from "./errors";
import { assertRawSqlSafe } from "./raw";

const db = getClickhouseKysely();
const where = (condition: RawBuilder<unknown>) =>
  db
    .selectFrom("traces as t")
    .select("t.id")
    .where(condition as never);
type Query = { toOperationNode(): unknown };
const check = (query: Query) => () => assertRawSqlSafe(query.toOperationNode());

describe("raw SQL checks", () => {
  it.each<[string, Query]>([
    [
      "modifyEnd",
      db
        .selectFrom("traces")
        .select("id")
        .modifyEnd(sql`or 1 = 1`),
    ],
    [
      "modifyFront",
      db
        .selectFrom("traces")
        .select("id")
        .modifyFront(sql`x`),
    ],
    ["a -- comment", where(sql`1 = 1 -- `)],
    ["a # comment", where(sql`1 = 1 # `)],
    ["a /* comment", where(sql`1 = 1 /* `)],
    ["a statement separator", where(sql`1 = 1; select 1`)],
    ["a bracket closed before it opens", where(sql`1 = 1) or (1 = 1`)],
    ["a bracket left open", where(sql`(1 = 1`)],
    ["a quote left open", where(sql`t.id = '`)],
    ["a quoted name left open", where(sql`"t.id = 1`)],
    [
      "a keyword spliced in by sql.id",
      where(sql`t.id in (${sql.id("select")} 1)`),
    ],
    [
      "a keyword split by empty raw SQL",
      where(sql`t.id = (1 fr${sql.raw("")}om scores)`),
    ],
    [
      "a keyword split around an sql.id name",
      where(sql`t.id = (1 fr${sql.id("om")} scores)`),
    ],
    ...["from", "join", "union", "intersect", "except", "settings", "into"].map(
      (keyword): [string, Query] => [
        `the keyword ${keyword}`,
        where(sql.raw(`1 ${keyword} 1`)),
      ],
    ),
    ["a table name after IN", where(sql`t.id in scores`)],
    [
      "a table name after NOT IN, by sql.ref",
      where(sql`t.id not in ${sql.ref("scores")}`),
    ],
    ["a quoted table name after IN", where(sql`t.id in "scores"`)],
    ["a bracketed table name after IN", where(sql`t.id in (scores)`)],
    ["a table name in an in() call", where(sql`in(t.id, scores)`)],
    ["a heredoc string", where(sql`t.id = $$'$$) or (1 = 1 or $$'$$ = ''`)],
    [
      "a function outside the allowlist",
      where(sql`dictGet('d', 'x', t.id) = 1`),
    ],
    ["a quoted function name", where(sql`"joinGet"('j', 'v', t.id) = 1`)],
    ["a table reference", where(sql`t.id in ${sql.table("scores")}`)],
  ])("rejects %s", (_shape, query) => {
    expect(check(query)).toThrow(UnscopedRelationError);
  });

  it("accepts expressions that stay in their slot and read no relation", () => {
    const query = db
      .selectFrom("traces as t")
      .distinct()
      .select(sql<string>`concat(t.id, '-- select from #')`.as("label"))
      .where(sql<boolean>`t.id in (${"a"}, ${"b"}) and has(${["x"]}, t.id)`)
      .where(sql<boolean>`(t.environment = 'it''s') and map() = map()`);
    expect(check(query)).not.toThrow();
  });
});
