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

  it("keeps the ngram prefilter outside the nested OR so both formats can prune", () => {
    const applied = new StringObjectFilter({
      clickhouseTable: "events_full",
      field: "metadata",
      operator: "contains",
      key: "config.timeout",
      value: "30",
      tablePrefix: "e",
    }).apply();

    expect(
      applied.query.startsWith("like(arrayStringConcat(e.metadata_values),"),
    ).toBe(true);
    expect(applied.query).toContain(" OR ");
    expect(applied.query).toContain("JSONExtractString(");
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
