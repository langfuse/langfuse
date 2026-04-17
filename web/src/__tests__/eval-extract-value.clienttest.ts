import { extractValueFromObject } from "@langfuse/shared";

describe("extractValueFromObject - JSONPath slicing", () => {
  const messages = [
    { role: "system" },
    { role: "user" },
    { role: "assistant" },
    { role: "user" },
  ];

  it("$[1:] returns full sliced array, not just first element", () => {
    const { value } = extractValueFromObject({ messages }, "messages", "$[1:]");
    expect(value).toBe(
      JSON.stringify([
        { role: "user" },
        { role: "assistant" },
        { role: "user" },
      ]),
    );
  });

  it("$[0:] returns the full array", () => {
    const { value } = extractValueFromObject({ messages }, "messages", "$[0:]");
    expect(value).toBe(JSON.stringify(messages));
  });

  it("$[*].role wildcard returns all role values", () => {
    const { value } = extractValueFromObject(
      { messages },
      "messages",
      "$[*].role",
    );
    expect(value).toBe(JSON.stringify(["system", "user", "assistant", "user"]));
  });

  it("returns empty string when path does not match", () => {
    const { value } = extractValueFromObject(
      { messages },
      "messages",
      "$.nonexistent",
    );
    // parseJsonDefault returns undefined when no match -> parseUnknownToString gives ""
    expect(value).toBe("");
  });

  it("returns full field value when no jsonSelector provided", () => {
    const { value } = extractValueFromObject({ messages }, "messages");
    expect(value).toBe(JSON.stringify(messages));
  });

  it("$[?(@.role=='assistant')] predicate returns all matching elements", () => {
    const { value } = extractValueFromObject(
      { messages },
      "messages",
      "$[?(@.role=='user')]",
    );
    expect(value).toBe(JSON.stringify([{ role: "user" }, { role: "user" }]));
  });

  it("works with JSON-string field containing an array", () => {
    // Common case: field is stored as JSON string
    const { value } = extractValueFromObject(
      { input: JSON.stringify(messages) },
      "input",
      "$[1:]",
    );
    expect(value).toBe(
      JSON.stringify([
        { role: "user" },
        { role: "assistant" },
        { role: "user" },
      ]),
    );
  });
});
