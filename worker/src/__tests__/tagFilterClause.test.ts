import { describe, it, expect } from "vitest";
import {
  buildTagFilterClause,
  type BlobStorageTagFilters,
} from "@langfuse/shared/src/server";

describe("buildTagFilterClause", () => {
  it("should return empty clause and params when no filters provided", () => {
    const result = buildTagFilterClause(undefined);
    expect(result.clause).toBe("");
    expect(result.params).toEqual({});

    const resultEmpty = buildTagFilterClause([]);
    expect(resultEmpty.clause).toBe("");
    expect(resultEmpty.params).toEqual({});
  });

  it("should generate correct clauses for each operator type", () => {
    const filters: BlobStorageTagFilters = [
      { operator: "any of", tags: ["prod", "staging"] },
      { operator: "all of", tags: ["important", "reviewed"] },
      { operator: "none of", tags: ["debug", "test"] },
    ];

    const result = buildTagFilterClause(filters);

    // Check clause contains all three conditions with AND
    expect(result.clause).toContain("AND");
    expect(result.clause).toContain(
      "hasAny({filterTags0: Array(String)}, tags) = 1",
    ); // any of
    expect(result.clause).toContain(
      "hasAll(tags, {filterTags1: Array(String)}) = 1",
    ); // all of
    expect(result.clause).toContain(
      "hasAny({filterTags2: Array(String)}, tags) = 0",
    ); // none of

    // Check params contain all tag arrays
    expect(result.params).toEqual({
      filterTags0: ["prod", "staging"],
      filterTags1: ["important", "reviewed"],
      filterTags2: ["debug", "test"],
    });
  });

  it("should skip filters with empty tags array", () => {
    const filters: BlobStorageTagFilters = [
      { operator: "any of", tags: [] }, // Should be skipped
      { operator: "all of", tags: ["important"] },
    ];

    const result = buildTagFilterClause(filters);

    // Should only have one condition (the second filter)
    expect(result.clause).toBe(
      "AND hasAll(tags, {filterTags1: Array(String)}) = 1",
    );
    expect(result.params).toEqual({
      filterTags1: ["important"],
    });
  });
});
