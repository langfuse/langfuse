import {
  MAX_SKILL_TOOL_ARGS_JSON_BYTES,
  type SkillsAvailable,
} from "@langfuse/shared";
import type { ToolCallInvocation } from "../hooks/useChatMLParser";

const SKILL_LOAD_TOOLS = new Set([
  "skill",
  "Skill",
  "loadSkill",
  "loadSkillResource",
  "langfuse_loadSkill",
  "langfuse_loadSkillResource",
  "skill_read",
  "readFile",
  "Read",
]);

function parseArguments(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    if (value.length > MAX_SKILL_TOOL_ARGS_JSON_BYTES) return;
    try {
      value = JSON.parse(value);
    } catch {
      return;
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  return value as Record<string, unknown>;
}

/** Matches output-side load requests to unambiguous available skill identities. */
export function getSkillLoadRequests(
  skills: SkillsAvailable,
  toolCallsByName: Map<string, ToolCallInvocation[]>,
): Map<SkillsAvailable[number], Set<string>> {
  const requests = new Map<SkillsAvailable[number], Set<string>>();

  for (const [toolName, calls] of toolCallsByName) {
    if (!SKILL_LOAD_TOOLS.has(toolName)) continue;
    for (const call of calls) {
      const args = parseArguments(call.arguments);
      if (!args) continue;
      const isResourceRead =
        toolName === "skill_read" || toolName.endsWith("loadSkillResource");
      if (
        isResourceRead &&
        (typeof args.path !== "string" || !args.path.trim())
      ) {
        continue;
      }

      let name: unknown;
      let filePath = "SKILL.md";
      if (toolName === "readFile" || toolName === "Read") {
        const path = args.path ?? args.file_path;
        if (typeof path !== "string") continue;
        const segments = path.split("/");
        if (segments.includes("..")) continue;
        const matches = segments.filter((segment) =>
          skills.some((skill) => skill.skillName === segment),
        );
        if (matches.length !== 1) continue;
        const index = segments.indexOf(matches[0]);
        // A skill directory alone is not a request to read a skill resource.
        if (!segments.slice(index + 1).join("/")) continue;
        name = matches[0];
        filePath = path;
      } else {
        name =
          toolName === "skill_read"
            ? args.skillName
            : (args.name ?? args.skill);
        if (isResourceRead && typeof args.path === "string")
          filePath = args.path;
      }

      if (typeof name !== "string") continue;
      const candidates = skills.filter(
        (skill) =>
          skill.skillName === name &&
          (args.version == null || skill.skillVersion === args.version),
      );
      if (candidates.length !== 1) continue;
      const skill = candidates[0];
      const skillRequests = requests.get(skill) ?? new Set<string>();
      skillRequests.add(filePath);
      requests.set(skill, skillRequests);
    }
  }

  return requests;
}
