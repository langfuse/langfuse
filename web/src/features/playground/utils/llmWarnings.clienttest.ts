import { describe, expect, it } from "vitest";

import { createLlmWarningsHeader, readLlmWarnings } from "./llmWarnings";

describe("LLM warning response headers", () => {
  it("round-trips warnings for the Playground client", () => {
    const response = new Response(null, {
      headers: createLlmWarningsHeader([
        "Unsupported temperature: ignored for this model",
      ]),
    });

    expect(readLlmWarnings(response)).toEqual([
      "Unsupported temperature: ignored for this model",
    ]);
  });

  it("ignores malformed warning headers", () => {
    const response = new Response(null, {
      headers: { "x-langfuse-llm-warnings": "%broken" },
    });

    expect(readLlmWarnings(response)).toEqual([]);
  });
});
