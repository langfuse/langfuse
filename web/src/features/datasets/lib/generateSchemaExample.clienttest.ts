import { generateSchemaExample } from "./generateSchemaExample";

describe("generateSchemaExample", () => {
  it("generates example for a simple object schema", async () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
    };
    const result = await generateSchemaExample(schema);
    expect(result).not.toBe("");
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("name");
    expect(parsed).toHaveProperty("age");
  });

  it("handles array type without items property", async () => {
    const schema = {
      type: "object",
      properties: {
        structure: { type: "array" },
      },
    };
    const result = await generateSchemaExample(schema);
    expect(result).not.toBe("");
  });

  it("preserves array items when they exist", async () => {
    const schema = {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
        },
      },
    };
    const result = await generateSchemaExample(schema);
    expect(result).not.toBe("");
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.tags)).toBe(true);
  });

  it("returns empty string for null schema", async () => {
    expect(await generateSchemaExample(null)).toBe("");
  });

  it("returns empty string for non-object schema", async () => {
    expect(await generateSchemaExample("not an object")).toBe("");
  });
});
