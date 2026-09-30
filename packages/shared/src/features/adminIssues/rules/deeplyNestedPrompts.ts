import { prisma } from "../../../db";
import { MAX_PROMPT_NESTING_DEPTH } from "../../../server/services/PromptService";
import type { AdminIssueDefinition, RuleIssue } from "../adminIssueDefinitions";

/** Deepest graph the API accepts: the root is level 0, level MAX is rejected. */
const MAX_RESOLVABLE_DEPTH = MAX_PROMPT_NESTING_DEPTH - 1;
const DEPTH_THRESHOLD = MAX_RESOLVABLE_DEPTH - 1;

type PromptVersion = {
  id: string;
  name: string;
  version: number;
  labels: string[];
};

type PromptDependencyRow = {
  parentId: string;
  childName: string;
  childLabel: string | null;
  childVersion: number | null;
};

export type DeeplyNestedPrompt = {
  name: string;
  version: number;
  depth: number;
};

/**
 * Nesting depth of every labelled prompt version (0 = no dependencies),
 * reported for those at or above `threshold`. A prompt that is itself a
 * dependency of another reported prompt is left out, so one deep graph
 * yields one finding.
 */
export const findDeeplyNestedPrompts = (
  prompts: PromptVersion[],
  dependencies: PromptDependencyRow[],
  threshold: number,
): DeeplyNestedPrompt[] => {
  const byNameVersion = new Map<string, PromptVersion>();
  const byNameLabel = new Map<string, PromptVersion>();
  for (const prompt of prompts) {
    byNameVersion.set(`${prompt.name}\u0000${prompt.version}`, prompt);
    for (const label of prompt.labels) {
      byNameLabel.set(`${prompt.name}\u0000${label}`, prompt);
    }
  }

  const children = new Map<string, PromptVersion[]>();
  for (const dependency of dependencies) {
    const child =
      dependency.childVersion !== null
        ? byNameVersion.get(
            `${dependency.childName}\u0000${dependency.childVersion}`,
          )
        : byNameLabel.get(
            `${dependency.childName}\u0000${dependency.childLabel}`,
          );
    if (!child) continue;
    const list = children.get(dependency.parentId) ?? [];
    list.push(child);
    children.set(dependency.parentId, list);
  }

  const depthById = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (prompt: PromptVersion): number => {
    const known = depthById.get(prompt.id);
    if (known !== undefined) return known;
    // Cycles cannot be created through the API; stop rather than recurse.
    if (visiting.has(prompt.id)) return 0;
    visiting.add(prompt.id);
    let depth = 0;
    for (const child of children.get(prompt.id) ?? []) {
      depth = Math.max(depth, depthOf(child) + 1);
    }
    visiting.delete(prompt.id);
    depthById.set(prompt.id, depth);
    return depth;
  };

  const deep = prompts.filter(
    (prompt) => prompt.labels.length > 0 && depthOf(prompt) >= threshold,
  );
  const nestedInDeep = new Set(
    deep.flatMap((prompt) =>
      (children.get(prompt.id) ?? []).map((child) => child.id),
    ),
  );
  return deep
    .filter((prompt) => !nestedInDeep.has(prompt.id))
    .map((prompt) => ({
      name: prompt.name,
      version: prompt.version,
      depth: depthOf(prompt),
    }));
};

export const deeplyNestedPromptsRule: AdminIssueDefinition = {
  id: "deeply-nested-prompts",
  name: "Deeply nested prompts",
  group: "prompts",
  callback: async (projectId): Promise<RuleIssue[]> => {
    const [prompts, dependencies] = await Promise.all([
      prisma.prompt.findMany({
        where: { projectId },
        select: { id: true, name: true, version: true, labels: true },
      }),
      prisma.promptDependency.findMany({
        where: { projectId },
        select: {
          parentId: true,
          childName: true,
          childLabel: true,
          childVersion: true,
        },
      }),
    ]);

    return findDeeplyNestedPrompts(prompts, dependencies, DEPTH_THRESHOLD).map(
      ({ name, version, depth }) => ({
        description: `Prompt "${name}" (version ${version}) nests ${depth} levels of prompt references; the limit is ${MAX_RESOLVABLE_DEPTH}, so adding a reference anywhere in this chain will fail. Flatten the chain or inline short snippets.`,
        priority: depth >= MAX_RESOLVABLE_DEPTH ? 2 : 3,
        ctaLink: `/project/${projectId}/prompts/${encodeURIComponent(name)}`,
      }),
    );
  },
};
