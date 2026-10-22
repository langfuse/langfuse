import {
  MAX_SKILL_TOOL_ARGS_JSON_BYTES,
  SKILL_RESOURCE_TOOL_NAMES,
  SkillSelectorSchema,
  type SkillsAvailable,
} from "@langfuse/shared";
import type { ToolCallInvocation } from "../hooks/useChatMLParser";

const SKILL_LOAD_TOOLS = new Set(
  Array.from(SKILL_RESOURCE_TOOL_NAMES).concat([
    "loadSkillResource",
    "langfuse_loadSkill",
    "langfuse_loadSkillResource",
  ]),
);

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

function getSkillFileFromPath(path: unknown, skills: SkillsAvailable) {
  if (typeof path !== "string") return;
  const segments = path.split("/");
  if (segments.includes("..")) return;
  const matches = segments.filter((segment) =>
    skills.some((skill) => skill.skillName === segment),
  );
  if (matches.length !== 1) return;
  const index = segments.indexOf(matches[0]);
  // Generic file reads must identify a resource beneath a skills directory.
  if (segments[index - 1] !== "skills") return;
  if (!segments.slice(index + 1).join("/")) return;
  return { name: matches[0], filePath: path };
}

function getRequestedSkillFile(
  toolName: string,
  args: Record<string, unknown>,
  skills: SkillsAvailable,
) {
  if (toolName === "readFile" || toolName === "Read") {
    return getSkillFileFromPath(args.path ?? args.file_path, skills);
  }
  const name =
    toolName === "skill_read" ? args.skillName : (args.name ?? args.skill);
  if (typeof name !== "string") return;
  const isResourceRead =
    toolName === "skill_read" || toolName.endsWith("loadSkillResource");
  if (!isResourceRead) return { name, filePath: "SKILL.md" };
  if (typeof args.path !== "string" || !args.path.trim()) return;
  return { name, filePath: args.path };
}

function findUniqueSkill(
  skills: SkillsAvailable,
  name: string,
  version: unknown,
) {
  const selector = SkillSelectorSchema.safeParse({ version });
  if (!selector.success) return;
  const candidates = skills.filter(
    (skill) =>
      skill.skillName === name &&
      (selector.data.version === undefined ||
        skill.skillVersion === selector.data.version),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
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
      const requested = getRequestedSkillFile(toolName, args, skills);
      if (!requested) continue;
      const skill = findUniqueSkill(skills, requested.name, args.version);
      if (!skill) continue;
      const skillRequests = requests.get(skill) ?? new Set<string>();
      skillRequests.add(requested.filePath);
      requests.set(skill, skillRequests);
    }
  }

  return requests;
}
