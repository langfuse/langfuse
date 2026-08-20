import { describe, expect, it } from "vitest";

import { IN_APP_AGENT_SYSTEM_PROMPT_TEMPLATE } from "./systemPrompt";

describe("IN_APP_AGENT_SYSTEM_PROMPT_TEMPLATE", () => {
  it("requires documentation lookup before answering product questions", () => {
    expect(IN_APP_AGENT_SYSTEM_PROMPT_TEMPLATE).toContain(
      "Before answering any question about the Langfuse product, always search the Langfuse documentation",
    );
  });
});
