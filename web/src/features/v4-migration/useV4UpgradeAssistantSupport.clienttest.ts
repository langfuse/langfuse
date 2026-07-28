import { describe, expect, it } from "vitest";

import { V4_CODING_AGENT_PROMPT } from "./useV4UpgradeAssistantSupport";

describe("V4_CODING_AGENT_PROMPT", () => {
  it("hands coding agents off to the canonical v4 migration skill", () => {
    expect(V4_CODING_AGENT_PROMPT).toContain(
      "https://raw.githubusercontent.com/langfuse/skills/main/skills/langfuse/references/v4-project-migration.md",
    );
    expect(V4_CODING_AGENT_PROMPT).toContain("code-only mode");
    expect(V4_CODING_AGENT_PROMPT).toContain(
      "Do not stop to install the Langfuse CLI or request credentials.",
    );
    expect(V4_CODING_AGENT_PROMPT).toContain("seven-row readiness report");
  });
});
