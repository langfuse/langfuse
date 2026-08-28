import { describe, expect, it } from "vitest";

import { StringObjectFilter } from "./clickhouse-filter";

describe("StringObjectFilter events metadata formats", () => {
  it("keeps a flat metadata key on the canonical has(names, key) path", () => {
    const applied = new StringObjectFilter({
      clickhouseTable: "events_full",
      field: "metadata",
      operator: "=",
      key: "environment",
      value: "production",
      tablePrefix: "e",
    }).apply();

    expect(applied.query).toContain("has(e.metadata_names,");
    expect(applied.query).not.toContain("JSONExtractString");
    expect(applied.query).not.toContain(" JSONHas(");
    expect(Object.values(applied.params)).toEqual([
      "environment",
      "production",
    ]);
  });

  it("ORs the flattened leaf with a top-level JSONExtract for nested keys", () => {
    const applied = new StringObjectFilter({
      clickhouseTable: "events_full",
      field: "metadata",
      operator: "=",
      key: "config.timeout",
      value: "30",
      tablePrefix: "e",
    }).apply();

    expect(applied.query).toContain(" OR ");
    expect(applied.query).toContain("JSONExtractString(");
    expect(applied.query).toContain("JSONHas(");
    expect(applied.query).toContain("has(e.metadata_names,");
    expect(Object.values(applied.params)).toEqual(
      expect.arrayContaining(["config.timeout", "config", "timeout", "30"]),
    );
    expect(Object.values(applied.params)).toHaveLength(4);
  });

  it("parameterizes each JSON path segment for deeper nested keys", () => {
    const applied = new StringObjectFilter({
      clickhouseTable: "events_full",
      field: "metadata",
      operator: "=",
      key: "a.b.c",
      value: "x",
      tablePrefix: "e",
    }).apply();

    expect(applied.query).toContain("JSONExtractString(");
    expect(Object.values(applied.params)).toEqual(
      expect.arrayContaining(["a.b.c", "a", "b", "c", "x"]),
    );
    expect(Object.values(applied.params)).toHaveLength(5);
  });

  it("scopes the ngram prefilter to the flattened branch so escaped JSON can still match", () => {
    const applied = new StringObjectFilter({
      clickhouseTable: "events_full",
      field: "metadata",
      operator: "contains",
      key: "config.timeout",
      value: "30",
      tablePrefix: "e",
    }).apply();

    expect(applied.query).toContain(
      "like(arrayStringConcat(e.metadata_values),",
    );
    expect(applied.query).toContain(" OR ");
    expect(applied.query).toContain("JSONExtractString(");
    // A raw LIKE cannot see JSON escape sequences (`\n` stored as `\\n`).
    // Gating the whole OR would drop migrated rows before JSONExtractString.
    expect(applied.query.startsWith("like(")).toBe(false);
    const afterOr = applied.query.slice(applied.query.indexOf(" OR ") + 4);
    expect(afterOr).toContain("JSONExtractString(");
    expect(afterOr).not.toContain("like(arrayStringConcat");
    expect(Object.values(applied.params)).toEqual(
      expect.arrayContaining([
        "config.timeout",
        "30",
        "%30%",
        "config",
        "timeout",
      ]),
    );
  });

  it("does not add the legacy JSONExtract branch for experiment metadata", () => {
    const applied = new StringObjectFilter({
      clickhouseTable: "events_full",
      field: "experiment_metadata",
      operator: "=",
      key: "config.timeout",
      value: "30",
      tablePrefix: "e",
    }).apply();

    expect(applied.query).not.toContain("JSONExtractString");
    expect(applied.query).not.toContain(" OR ");
    expect(Object.values(applied.params)).toEqual(["config.timeout", "30"]);
  });

  it("does not add the legacy JSONExtract branch on traces Map metadata", () => {
    const applied = new StringObjectFilter({
      clickhouseTable: "traces",
      field: "metadata",
      operator: "=",
      key: "config.timeout",
      value: "30",
      tablePrefix: "t",
    }).apply();

    expect(applied.query).toContain("mapContains(t.metadata,");
    expect(applied.query).not.toContain("JSONExtractString");
    expect(applied.query).not.toContain(" OR ");
  });
});
