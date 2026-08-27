import { describe, expect, it } from "vitest";

import {
  clickhouseFormatAvailable,
  clickhouseLocalAvailable,
  executeClickhouseLocal,
  formatSql,
  normalizeParams,
  substituteNamedParams,
} from "../goldenHarness";
import { CATALOG, CATALOG_PROJECT_ID } from "./catalog";
import { compileClickhouseQuery } from "./compile";

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

const describeWithClickhouseLocal = clickhouseLocalAvailable()
  ? describe
  : describe.skip;

if (!clickhouseFormatAvailable()) {
  console.warn(
    "[catalog] `clickhouse format` unavailable — skipping catalog parity tests.",
  );
}

if (!clickhouseLocalAvailable()) {
  console.warn(
    "[catalog] `clickhouse local` unavailable — skipping JOIN execution tests.",
  );
}

describeWithClickhouse("catalog parity", () => {
  for (const entry of CATALOG) {
    it(`${entry.id} (tier ${entry.tier}) compile(AST) ≡ referenceSQL`, () => {
      const compiled = compileClickhouseQuery(entry.build(), {
        projectId: CATALOG_PROJECT_ID,
      });

      const left = normalizeParams(formatSql(compiled.sql), compiled.params);
      const right = normalizeParams(
        formatSql(entry.referenceSql),
        compiled.params,
      );

      expect(left.sql).toBe(right.sql);
    });
  }
});

const JOIN_MEMORY_DDL = `
  CREATE TABLE observations (
    environment String,
    project_id String,
    start_time DateTime64(3),
    trace_id String,
    cost_details Map(String, Float64),
    usage_details Map(String, Float64)
  ) ENGINE = Memory;
  CREATE TABLE traces (
    environment String,
    project_id String,
    timestamp DateTime64(3),
    id String
  ) ENGINE = Memory;
`;

describeWithClickhouseLocal("catalog JOIN execution", () => {
  it("join_observations_traces is valid ClickHouse with table-qualified project_id on both sides", () => {
    const entry = CATALOG.find((e) => e.id === "join_observations_traces");
    expect(entry).toBeDefined();
    if (!entry) return;

    const compiled = compileClickhouseQuery(entry.build(), {
      projectId: CATALOG_PROJECT_ID,
    });
    const refs = compiled.sql.match(/[\w.]*project_id/gi) ?? [];
    expect(refs.length).toBeGreaterThanOrEqual(3);
    for (const ref of refs) {
      expect(ref).toMatch(/^(o|t)\.project_id$/i);
    }

    const executable = substituteNamedParams(compiled.sql, compiled.params);
    executeClickhouseLocal(`${JOIN_MEMORY_DDL}\n${executable}`);

    const explained = executeClickhouseLocal(
      `${JOIN_MEMORY_DDL}\nEXPLAIN QUERY TREE ${executable}`,
    );
    expect(explained).toMatch(/table_name: default\.observations/);
    expect(explained).toMatch(/table_name: default\.traces/);
    // Injected t.project_id and WHERE o.project_id resolve to different tables.
    expect(explained).toMatch(
      /column_name: project_id, result_type: String, source_id: 3/,
    );
    expect(explained).toMatch(
      /column_name: project_id, result_type: String, source_id: 5/,
    );
  });
});
