import { paginationZod } from "@langfuse/shared";
import { ZodError } from "zod";

// Create test cases
describe("Pagination Zod Schema", () => {
  it("should validate valid input", () => {
    const pageResult = paginationZod.page.parse("2");
    const limitResult = paginationZod.limit.parse("20");

    expect(pageResult).toBe(2);
    expect(limitResult).toBe(20);
  });

  it("should handle empty values", () => {
    const pageResult = paginationZod.page.parse("");
    const limitResult = paginationZod.limit.parse("");

    expect(pageResult).toBe(1);
    expect(limitResult).toBe(50);
  });

  it("should handle invalid input", () => {
    expect(() => paginationZod.page.parse("abc")).toThrowError(ZodError);
    expect(() => paginationZod.limit.parse("abc")).toThrowError(ZodError);
  });
});
