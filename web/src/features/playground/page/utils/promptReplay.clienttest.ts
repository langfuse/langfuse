import { describe, expect, it } from "vitest";
import type { Prompt } from "@langfuse/shared";
import {
  bindRecordedPromptVariables,
  loadPromptReplay,
  readRecordedPromptVariables,
} from "./promptReplay";

const prompt = (version: number): Prompt => ({
  id: `prompt-${version}`,
  name: "example",
  version,
  projectId: "project",
  prompt: "Explain {{topic}}",
  type: "text",
  config: {},
  labels: [],
  tags: [],
  isActive: null,
  commitMessage: null,
  createdBy: "API",
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

describe("Recorded prompt replay", () => {
  it("binds recorded values to the recorded or latest resolved prompt", async () => {
    const recorded = readRecordedPromptVariables(
      JSON.stringify({
        promptVariables: { topic: "  structured logging  ", unused: "ignored" },
      }),
    );
    expect(recorded.success).toBe(true);
    if (!recorded.success) throw new Error(recorded.reason);

    for (const source of ["recorded", "latest"] as const) {
      const replay = await loadPromptReplay(
        { projectId: "project", promptId: "prompt-1", source },
        {
          getPrompt: async () => prompt(1),
          getVersions: async () => ({ promptVersions: [prompt(2)] }),
          resolvePrompt: async ({ promptId }) => ({
            resolvedPrompt:
              promptId === "prompt-1"
                ? "Explain {{topic}}"
                : "Explain {{topic}} in {{language}}",
          }),
        },
      );
      expect(replay?.version).toBe(source === "recorded" ? 1 : 2);
      expect(replay?.resolvedPrompt).toBe(
        source === "recorded"
          ? "Explain {{topic}}"
          : "Explain {{topic}} in {{language}}",
      );
      expect(
        bindRecordedPromptVariables(
          source === "recorded" ? ["topic"] : ["topic", "language"],
          recorded.variables,
        ),
      ).toEqual([
        { name: "topic", value: "  structured logging  ", isUsed: true },
        ...(source === "latest"
          ? [{ name: "language", value: "", isUsed: true }]
          : []),
      ]);
    }
  });

  it.each([
    null,
    "{",
    "{}",
    '{"promptVariables":{}}',
    '{"promptVariables":{"topic":7}}',
    '{"promptVariables":[]}',
  ])("reports unavailable recorded values for %s", (metadata) => {
    expect(readRecordedPromptVariables(metadata).success).toBe(false);
  });

  it("does not use inherited properties as variable values", () => {
    expect(bindRecordedPromptVariables(["toString"], {})).toEqual([
      { name: "toString", value: "", isUsed: true },
    ]);
  });

  it("reports a deleted recorded prompt as unavailable", async () => {
    expect(
      await loadPromptReplay(
        { projectId: "project", promptId: "deleted", source: "recorded" },
        {
          getPrompt: async () => null,
          getVersions: async () => ({ promptVersions: [] }),
          resolvePrompt: async () => ({ resolvedPrompt: "" }),
        },
      ),
    ).toBeNull();
  });
});
