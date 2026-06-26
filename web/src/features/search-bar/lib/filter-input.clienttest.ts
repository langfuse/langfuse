import { describe, expect, it } from "vitest";

import { astToFilterInput } from "@/src/features/search-bar/lib/adapter";
import { filterInputToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { parse } from "@/src/features/search-bar/lib/langQ";
import { validateQuery } from "@/src/features/search-bar/lib/validate";

const lower = (text: string) => astToFilterInput(parse(text).ast);

describe("astToFilterInput — flat vs tree", () => {
  it("keeps a pure AND query flat (sidebar-owned)", () => {
    const { filterInput, errors } = lower("level:ERROR name:checkout");
    expect(errors).toEqual([]);
    expect(Array.isArray(filterInput)).toBe(true);
    expect(filterInput).toEqual([
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
      {
        type: "string",
        column: "name",
        operator: "contains",
        value: "checkout",
      },
    ]);
  });

  it("lowers cross-field OR to a nested OR tree", () => {
    const { filterInput, errors } = lower("level:ERROR OR name:checkout");
    expect(errors).toEqual([]);
    expect(filterInput).toEqual({
      type: "group",
      operator: "OR",
      conditions: [
        {
          type: "stringOptions",
          column: "level",
          operator: "any of",
          value: ["ERROR"],
        },
        {
          type: "string",
          column: "name",
          operator: "contains",
          value: "checkout",
        },
      ],
    });
  });

  it("collapses same-field OR to a single flat any-of (not a tree)", () => {
    const { filterInput, errors } = lower("level:ERROR OR level:WARNING");
    expect(errors).toEqual([]);
    expect(filterInput).toEqual([
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR", "WARNING"],
      },
    ]);
  });

  it("lowers a grouped cross-field OR AND'd with other leaves to a tree", () => {
    const { filterInput, errors } = lower(
      "(level:ERROR OR name:checkout) -environment:prod",
    );
    expect(errors).toEqual([]);
    // Outer AND: the cross-field OR group + the negated env leaf.
    expect(filterInput).toMatchObject({
      type: "group",
      operator: "AND",
      conditions: [
        { type: "group", operator: "OR" },
        { type: "stringOptions", column: "environment", operator: "none of" },
      ],
    });
  });
});

describe("astToFilterInput — gates", () => {
  it("rejects free text inside an OR", () => {
    const { errors } = lower("hello OR level:ERROR");
    expect(errors.join(" ")).toMatch(/cannot be combined with OR/);
  });

  it("rejects a negated group", () => {
    const { errors } = lower("NOT (level:ERROR name:checkout)");
    expect(errors.join(" ")).toMatch(/Negated groups are not supported/);
  });

  it("validateQuery now accepts cross-field OR + brackets", () => {
    expect(validateQuery("level:ERROR OR name:checkout").valid).toBe(true);
    expect(
      validateQuery("(level:ERROR OR level:WARNING) -environment:prod").valid,
    ).toBe(true);
  });
});

describe("filterInputToQueryText — reverse round-trip", () => {
  const roundTrips = (text: string) => {
    const forward = lower(text);
    const back = filterInputToQueryText(forward.filterInput, {});
    const reForward = astToFilterInput(parse(back.text).ast);
    expect(validateQuery(back.text).valid).toBe(true);
    expect(reForward.filterInput).toEqual(forward.filterInput);
  };

  it("round-trips a cross-field OR tree", () => {
    roundTrips("level:ERROR OR name:checkout");
  });

  it("round-trips a nested (OR) AND chain", () => {
    roundTrips("(level:ERROR OR level:WARNING) -environment:prod");
  });

  it("round-trips a flat AND query", () => {
    roundTrips("level:ERROR name:checkout latency:>2");
  });
});
