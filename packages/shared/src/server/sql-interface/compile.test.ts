import { describe, expect, it } from "vitest";

import { compileCustomerSql } from "./compile";
import { CustomerSqlError } from "./errors";

const PROJECT = "project-a";
const NOW = new Date("2026-11-16T00:00:00Z");
const compile = (sql: string, opts = {}) =>
  compileCustomerSql(sql, PROJECT, { now: NOW, ...opts });

describe("compileCustomerSql", () => {
  it("lowers an aggregate query onto events_core with tenancy injected", () => {
    const out = compile(`
      SELECT name, count(*) AS n, quantile(0.95)(latency_ms) AS p95
      FROM observations
      WHERE start_time >= now() - INTERVAL 7 DAY AND metadata['tier'] = 'pro'
      GROUP BY name
      ORDER BY n DESC
      LIMIT 10`);

    expect(out.sql).toBe(
      "select e.name as name, count() as n, quantile(0.95)(dateDiff('millisecond', e.start_time, e.end_time)) as p95 " +
        "from events_core as e " +
        "where e.project_id = {p1:String} and (e.start_time >= {p2:DateTime64(6)} - toIntervalDay(7) " +
        "and mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values))[{p3:String}] = {p4:String}) " +
        "group by e.name order by n desc limit {p5:Int64}",
    );
    expect(out.params).toEqual({
      p1: PROJECT,
      p2: "2026-11-16 00:00:00.000",
      p3: "tier",
      p4: "pro",
      p5: 10,
    });
    expect(out.columns).toEqual(["name", "n", "p95"]);
  });

  it("keeps the tenancy filter outside a customer OR", () => {
    const { sql } = compile(
      "SELECT id FROM observations WHERE name = 'x' OR 1 = 1",
    );
    expect(sql).toContain(
      "where e.project_id = {p1:String} and (e.name = {p2:String} or",
    );
  });

  it("routes payload columns to events_full and applies the access floor", () => {
    const { sql, params } = compile("SELECT id, input FROM observations", {
      minStartTime: new Date("2026-11-01T00:00:00Z"),
    });
    expect(sql).toContain("from events_full as e");
    expect(sql).toContain("e.start_time >= {p2:DateTime64(6)}");
    expect(params.p2).toBe("2026-11-01 00:00:00.000");
  });

  it.each([
    ["two statements", "SELECT id FROM observations; SELECT 1"],
    ["a join", "SELECT id FROM observations o JOIN traces t ON 1 = 1"],
    ["a comma join", "SELECT id FROM observations, traces"],
    ["a subquery in FROM", "SELECT id FROM (SELECT * FROM events_full)"],
    [
      "a subquery in IN",
      "SELECT id FROM observations WHERE id IN (SELECT span_id FROM events_full)",
    ],
    ["a scalar subquery", "SELECT (SELECT 1) FROM observations"],
    ["a UNION", "SELECT id FROM observations UNION ALL SELECT id FROM x"],
    ["SETTINGS", "SELECT id FROM observations SETTINGS readonly = 0"],
    ["a physical table", "SELECT * FROM events_full"],
    ["an internal column", "SELECT project_id FROM observations"],
    ["an unknown column", "SELECT nope FROM observations"],
    ["a prototype key as column", "SELECT constructor FROM observations"],
    ["a prototype key as table", "SELECT id FROM __proto__"],
    [
      "an alias shadowing a column",
      "SELECT name AS project_id FROM observations",
    ],
    ["a table function", "SELECT file('/etc/passwd') FROM observations"],
    ["a server-state function", "SELECT currentUser() FROM observations"],
    ["sleep", "SELECT sleep(3) FROM observations"],
    ["a backslash string", "SELECT id FROM observations WHERE name = '\\''"],
    ["an aggregate in WHERE", "SELECT id FROM observations WHERE count() > 1"],
    ["sum over a string", "SELECT sum(name) FROM observations"],
    ["a LIMIT above the cap", "SELECT id FROM observations LIMIT 100000"],
  ])("rejects %s", (_, sql) => {
    expect(() => compile(sql)).toThrow(CustomerSqlError);
  });
});
