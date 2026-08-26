import { describe, expect, it } from "vitest";

import { buildCatalog } from "./catalog";
import { compile } from "./compile";
import {
  clickhouseFormatAvailable,
  formatSql,
  normalizeParams,
} from "./goldenHarness";

const PROJECT_ID = "golden-project";
const FROM_TS = new Date("2026-01-01T00:00:00.000Z");

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

if (!clickhouseFormatAvailable()) {
  console.warn(
    "[catalog-parity] `clickhouse format` unavailable — skipping catalog SQL tests. Install clickhouse-local to run them.",
  );
}

describeWithClickhouse("catalog parity: compile(AST) ≡ referenceSQL", () => {
  const catalog = buildCatalog(FROM_TS);

  for (const sample of catalog) {
    it(sample.id, () => {
      const compiled = compile(sample.plan, { projectId: PROJECT_ID });
      const compiledNorm = normalizeParams(
        formatSql(compiled.sql),
        compiled.params,
      );
      const referenceNorm = normalizeParams(formatSql(sample.referenceSql), {
        projectId: PROJECT_ID,
        fromTimestamp: FROM_TS,
        dataTypes: ["NUMERIC", "BOOLEAN", "CATEGORICAL", "TEXT"],
        isDeleted: 0,
      });
      expect(compiledNorm.sql).toBe(referenceNorm.sql);
      expect(compiledNorm.params).toEqual(referenceNorm.params);
    });
  }
});
