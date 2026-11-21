import {
  getSkillLoadRequestsFromArguments,
  isSkillLoadTool,
  parseSkillToolArguments,
  SkillSelectorSchema,
  type SkillsAvailable,
} from "@langfuse/shared";
import type { ToolCallInvocation } from "../hooks/useChatMLParser";

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
  metadata?: unknown,
): Map<SkillsAvailable[number], Set<string>> {
  const requests = new Map<SkillsAvailable[number], Set<string>>();

  const availableNames = skills.map((skill) => skill.skillName);
  for (const [toolName, calls] of toolCallsByName) {
    if (!isSkillLoadTool(toolName, metadata)) continue;
    for (const call of calls) {
      const args = parseSkillToolArguments(call.arguments);
      if (args === undefined) continue;
      for (const requested of getSkillLoadRequestsFromArguments(
        toolName,
        args,
        availableNames,
        metadata,
      )) {
        if (!requested.filePath.trim()) continue;
        const skill = findUniqueSkill(
          skills,
          requested.skillName,
          requested.version,
        );
        if (!skill) continue;
        const skillRequests = requests.get(skill) ?? new Set<string>();
        skillRequests.add(requested.sourcePath ?? requested.filePath);
        requests.set(skill, skillRequests);
      }
    }
  }

  return requests;
}
