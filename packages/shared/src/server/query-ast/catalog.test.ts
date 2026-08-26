import { describe, expect, it } from "vitest";

import { CATALOG, CATALOG_PROJECT_ID } from "./catalog";
import {
  clickhouseFormatAvailable,
  formatSql,
  normalizeParams,
} from "./goldenHarness";
import { compileClickhouseQuery } from "./kysely/compile";

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

if (!clickhouseFormatAvailable()) {
  console.warn(
    "[catalog] `clickhouse format` unavailable — skipping catalog parity tests.",
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
