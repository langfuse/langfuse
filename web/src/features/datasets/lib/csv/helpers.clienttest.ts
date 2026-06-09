import { describe, expect, it } from "vitest";
import { parseValue } from "./helpers";

describe("CSV dataset parsing", () => {
  it("preserves unsafe integer values as strings", () => {
    expect(parseValue("107505301260286111")).toBe("107505301260286111");
    expect(parseValue('{"input_number":107505301260286111}')).toEqual({
      input_number: "107505301260286111",
    });
  });

  it("keeps safe numbers as numbers", () => {
    expect(parseValue("42")).toBe(42);
    expect(parseValue("3.4")).toBe(3.4);
    expect(parseValue('{"safe_number":42}')).toEqual({ safe_number: 42 });
  });

  it("keeps case-insensitive boolean fallback behavior", () => {
    expect(parseValue("true")).toBe(true);
    expect(parseValue("FALSE")).toBe(false);
  });
});
