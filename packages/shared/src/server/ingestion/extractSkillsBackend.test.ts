import { describe, expect, it } from "vitest";
import { extractSkillsFromObservation } from "./extractSkillsBackend";

function extractSkillLoad(input: unknown, metadata?: unknown) {
  return extractSkillsFromObservation({
    skillsAvailable: undefined,
    observationType: "TOOL",
    name: "skill",
    input,
    output: "<skill_content>…</skill_content>",
    isError: false,
    metadata,
    projectId: "project-1",
  });
}

describe("extractSkillsFromObservation", () => {
  it("records an OpenCode skill tool load identified by id", () => {
    expect(extractSkillLoad('{"id":"refund-policy"}')).toEqual({
      skillsResourceLoaded: [
        { skillName: "refund-policy", filePath: "SKILL.md" },
      ],
    });
  });

  it("keeps Codex skill tool inputs on the shell command path", () => {
    expect(
      extractSkillLoad('{"id":"refund-policy"}', {
        resourceAttributes: { "service.name": "codex" },
      }),
    ).toEqual({});
  });
});
