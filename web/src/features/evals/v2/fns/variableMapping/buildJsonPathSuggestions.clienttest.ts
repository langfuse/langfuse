import { describe, expect, it } from "vitest";

import { buildJsonPathSuggestions } from "./buildJsonPathSuggestions";

describe("buildJsonPathSuggestions", () => {
  it("walks nested objects and a bounded sample of array entries", () => {
    expect(
      buildJsonPathSuggestions({
        messages: [
          { content: "one" },
          { content: "two" },
          { content: "three" },
          { content: "four" },
        ],
      }),
    ).toEqual([
      "$.messages",
      "$.messages[0]",
      "$.messages[0].content",
      "$.messages[1]",
      "$.messages[1].content",
      "$.messages[2]",
      "$.messages[2].content",
      "$.messages[*]",
    ]);
  });

  it("uses escaped bracket notation for non-identifier object keys", () => {
    expect(
      buildJsonPathSuggestions({
        'quoted"key': { "back\\slash": true },
      }),
    ).toEqual(['$["quoted\\"key"]', '$["quoted\\"key"]["back\\\\slash"]']);
  });

  it("returns no suggestions for scalar values", () => {
    expect(buildJsonPathSuggestions("42")).toEqual([]);
  });
});
