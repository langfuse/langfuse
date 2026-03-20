import { clickhouseSearchCondition } from "@langfuse/shared/src/server";

describe("clickhouseSearchCondition", () => {
  it("should auto-prefix custom columns with tablePrefix", () => {
    const result = clickhouseSearchCondition("test", undefined, "e", [
      "span_id",
      "name",
      "user_id",
      "session_id",
      "trace_id",
    ]);

    expect(result.query).toContain("e.span_id ILIKE");
    expect(result.query).toContain("e.name ILIKE");
    expect(result.query).toContain("e.user_id ILIKE");
    expect(result.query).toContain("e.session_id ILIKE");
    expect(result.query).toContain("e.trace_id ILIKE");
    expect(result.params).toEqual({ searchString: "%test%" });
  });

  it("should not double-prefix columns that already have a qualifier", () => {
    const result = clickhouseSearchCondition("test", undefined, "e", [
      "t.user_id",
      "name",
    ]);

    expect(result.query).toContain("t.user_id ILIKE");
    expect(result.query).toContain("e.name ILIKE");
  });

  it("should use default columns with prefix when no custom columns provided", () => {
    const result = clickhouseSearchCondition("test", undefined, "o");

    expect(result.query).toContain("o.id ILIKE");
    expect(result.query).toContain("o.name ILIKE");
    expect(result.query).toContain("t.user_id ILIKE");
  });

  it("should return empty query and params when no search query provided", () => {
    const result = clickhouseSearchCondition(undefined, undefined, "e", [
      "name",
    ]);

    expect(result.query).toBe("");
    expect(result.params).toEqual({});
  });

  it("should include content search when searchType includes content", () => {
    const result = clickhouseSearchCondition("test", ["id", "content"], "e", [
      "name",
    ]);

    expect(result.query).toContain("e.name ILIKE");
    expect(result.query).toContain("e.input ILIKE");
    expect(result.query).toContain("e.output ILIKE");
  });
});
