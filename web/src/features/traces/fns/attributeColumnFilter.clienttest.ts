// @vitest-environment node

import { describe, expect, it } from "vitest";
import { attributeColumnFilter } from "./attributeColumnFilter";

describe("attributeColumnFilter", () => {
  it("filters session and user on the caller's table with option clauses", () => {
    for (const [key, column] of [
      ["session_id", "sessionId"],
      ["user_id", "userId"],
    ] as const) {
      for (const target of ["observations", "traces"] as const) {
        const filter = attributeColumnFilter(key, "abc", target);
        expect(filter?.target).toBe(target);
        expect(filter?.include).toEqual({
          column,
          type: "stringOptions",
          operator: "any of",
          value: ["abc"],
        });
        expect(filter?.exclude).toEqual({
          column,
          type: "stringOptions",
          operator: "none of",
          value: ["abc"],
        });
      }
    }
  });

  it("offers no exclude for string columns, which cannot negate exactly", () => {
    const filter = attributeColumnFilter("version", "1.2", "traces");
    expect(filter?.include).toEqual({
      column: "version",
      type: "string",
      operator: "=",
      value: "1.2",
    });
    expect(filter?.exclude).toBeUndefined();
  });
});
