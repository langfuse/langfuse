import { describe, expect, it } from "vitest";
import { type FilterState } from "@langfuse/shared";
import { inMemoryFilterRequiresMetadata } from "../features/evaluation/traceFilterUtils";

describe("inMemoryFilterRequiresMetadata", () => {
  it("returns false for an empty filter", () => {
    expect(inMemoryFilterRequiresMetadata([])).toBe(false);
  });

  it("returns false when only non-metadata in-memory columns are referenced", () => {
    const filter: FilterState = [
      { type: "string", column: "Name", operator: "=", value: "checkout" },
      {
        type: "arrayOptions",
        column: "Tags",
        operator: "any of",
        value: ["prod"],
      },
    ];
    expect(inMemoryFilterRequiresMetadata(filter)).toBe(false);
  });

  it("returns true when a condition references metadata", () => {
    const filter: FilterState = [
      {
        type: "stringObject",
        column: "metadata",
        key: "tier",
        operator: "=",
        value: "premium",
      },
    ];
    expect(inMemoryFilterRequiresMetadata(filter)).toBe(true);
  });

  it("returns true when metadata is referenced by its UI table name", () => {
    const filter: FilterState = [
      {
        type: "stringObject",
        column: "Metadata",
        key: "tier",
        operator: "=",
        value: "premium",
      },
    ];
    expect(inMemoryFilterRequiresMetadata(filter)).toBe(true);
  });

  it("returns false when the filter requires a database lookup", () => {
    // A Level condition cannot be evaluated in memory, so the whole filter
    // goes to the database and the cached trace's metadata is never read.
    const filter: FilterState = [
      {
        type: "stringObject",
        column: "metadata",
        key: "tier",
        operator: "=",
        value: "premium",
      },
      { type: "string", column: "Level", operator: "=", value: "ERROR" },
    ];
    expect(inMemoryFilterRequiresMetadata(filter)).toBe(false);
  });

  it("returns true for unknown columns", () => {
    const filter: FilterState = [
      {
        type: "string",
        column: "not-a-real-column",
        operator: "=",
        value: "x",
      },
    ];
    expect(inMemoryFilterRequiresMetadata(filter)).toBe(true);
  });
});
