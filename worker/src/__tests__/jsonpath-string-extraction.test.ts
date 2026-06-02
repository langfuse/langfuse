import { describe, expect, it } from "vitest";
import { extractValueFromObject } from "../../../packages/shared/src/features/evals/utilities";

describe("extractValueFromObject - JsonPath on stringified JSON", () => {
  const stringifiedOutput = JSON.stringify({
    actual_output: "**Whitelist User Count (Incremental L1)**...",
    context: "[milvus-kb.search_sql_recipes]...",
  });

  it("should extract plain string from stringified JSON via JsonPath", () => {
    const { value, error } = extractValueFromObject(
      { output: stringifiedOutput },
      "output",
      "$.actual_output",
    );

    expect(error).toBeNull();
    expect(value).toBe("**Whitelist User Count (Incremental L1)**...");
  });

  it("should NOT wrap extracted primitive in array brackets", () => {
    const { value } = extractValueFromObject(
      { output: stringifiedOutput },
      "output",
      "$.actual_output",
    );

    expect(typeof value).toBe("string");
    expect(value).not.toMatch(/^\[/);
  });

  it("should extract string containing brackets from JsonPath", () => {
    const { value, error } = extractValueFromObject(
      { output: stringifiedOutput },
      "output",
      "$.context",
    );

    expect(error).toBeNull();
    expect(value).toBe("[milvus-kb.search_sql_recipes]...");
  });

  it("should extract first element from stringified array", () => {
    const stringifiedArray = JSON.stringify(["item1", "item2", "item3"]);

    const { value, error } = extractValueFromObject(
      { output: stringifiedArray },
      "output",
      "$[0]",
    );

    expect(error).toBeNull();
    expect(value).toBe("item1");
  });

  it("should return full array via wildcard selector", () => {
    const stringifiedArray = JSON.stringify(["item1", "item2", "item3"]);

    const { value, error } = extractValueFromObject(
      { output: stringifiedArray },
      "output",
      "$[*]",
    );

    expect(error).toBeNull();
    expect(value).toEqual(["item1", "item2", "item3"]);
  });

  it("should work with already-parsed objects (observation eval path)", () => {
    const parsed = JSON.parse(stringifiedOutput);

    const { value, error } = extractValueFromObject(
      { output: parsed },
      "output",
      "$.actual_output",
    );

    expect(error).toBeNull();
    expect(value).toBe("**Whitelist User Count (Incremental L1)**...");
  });

  it("should return raw string when no jsonSelector provided", () => {
    const { value, error } = extractValueFromObject(
      { output: "hello world" },
      "output",
    );

    expect(error).toBeNull();
    expect(value).toBe("hello world");
  });
});
