import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  V4_CODING_AGENT_PROMPT,
  useCanUseAgentForMigration,
} from "./useV4UpgradeAssistantSupport";

const mocks = vi.hoisted(() => ({
  organization: { aiFeaturesEnabled: false },
}));

vi.mock("@/src/features/in-app-agent/components/InAppAiAgentProvider", () => ({
  useCanUseInAppAgent: () => true,
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: () => ({
    organization: mocks.organization,
  }),
}));

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

describe("useCanUseAgentForMigration", () => {
  it("requires AI features to be enabled", () => {
    const { result } = renderHook(() => useCanUseAgentForMigration());

    expect(result.current).toBe(false);
  });
});
