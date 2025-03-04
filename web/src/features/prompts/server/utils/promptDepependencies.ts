import { type Prompt, prisma } from "@langfuse/shared/src/db";
import { z } from "zod";
import { PromptType } from "./validation";

export const PromptDependencyRegex = /@@@langfusePrompt:(.*)@@@/g;

export const ParsedPromptDependencySchema = z.union([
  z.object({
    name: z.string(),
    type: z.literal("version"),
    version: z.coerce.number(),
  }),
  z.object({ name: z.string(), type: z.literal("label"), label: z.string() }),
]);

export type ParsedPromptDependencyTag = z.infer<
  typeof ParsedPromptDependencySchema
>;

export function parsePromptDependencyTags(
  content: string,
): ParsedPromptDependencyTag[] {
  const matches = content.match(PromptDependencyRegex);

  const validTags: ParsedPromptDependencyTag[] = [];

  for (const match of matches ?? []) {
    const innerContent = match.replace(/^@@@langfusePrompt:|@@@$/g, "");
    const parts = innerContent.split("|");
    const params: Record<string, string> = {};

    parts.forEach((part) => {
      const [key, value] = part.split("=");
      params[key] = value;
    });

    if (params.name) {
      const parsed = ParsedPromptDependencySchema.safeParse({
        name: params.name,
        ...(params.version
          ? { version: params.version, type: "version" }
          : { label: params.label, type: "label" }),
      });

      if (parsed.success) {
        validTags.push(parsed.data);
      }
    }
  }

  return validTags;
}

type PartialPrompt = Pick<
  Prompt,
  "id" | "prompt" | "name" | "version" | "labels"
>;

export type PromptDependencyGraph = {
  prompts: Record<string, PartialPrompt>;
  adjacencies: Record<string, string[]>;
  rootId: string;
};

export async function buildDependencyGraph(
  projectId: string,
  parentPrompt: PartialPrompt,
  dependencies: ParsedPromptDependencyTag[],
): Promise<PromptDependencyGraph> {
  const result: PromptDependencyGraph = {
    prompts: {},
    adjacencies: {},
    rootId: parentPrompt.id,
  };
  const seen = new Set<string>();

  async function buildGraph(
    currentPrompt: PartialPrompt,
    deps?: ParsedPromptDependencyTag[],
  ) {
    if (seen.has(currentPrompt.id)) {
      throw Error(
        `Circular dependency detected involving prompt with id ${currentPrompt.id}`,
      );
    }

    seen.add(currentPrompt.id);
    result.prompts[currentPrompt.id] = currentPrompt;

    let promptDependencies = deps;
    if (!deps) {
      promptDependencies = (
        await prisma.promptDependency.findMany({
          where: {
            projectId,
            parentId: currentPrompt.id,
          },
          select: {
            childName: true,
            childLabel: true,
            childVersion: true,
          },
        })
      ).map(
        (dep) =>
          ({
            name: dep.childName,
            ...(dep.childVersion
              ? { type: "version", version: dep.childVersion }
              : { type: "label", label: dep.childLabel }),
          }) as ParsedPromptDependencyTag,
      );
    }

    if (!promptDependencies || !promptDependencies.length) return;

    for (const dep of promptDependencies) {
      const depPrompt = await prisma.prompt.findFirst({
        where: {
          projectId,
          name: dep.name,
          ...(dep.type === "version"
            ? { version: dep.version }
            : { label: dep.label }), // TODO: fix to use list membership
        },
      });

      const promptLogName = `${dep.name} - ${dep.type} ${dep.type === "version" ? dep.version : dep.label}`;

      if (!depPrompt)
        throw Error(`Prompt dependency not found: ${promptLogName}`);

      if (depPrompt.type !== PromptType.Text)
        throw Error(`Prompt dependency is not a text prompt: ${promptLogName}`);

      result.adjacencies[currentPrompt.id] ??= [];
      result.adjacencies[currentPrompt.id].push(depPrompt.id);

      await buildGraph(depPrompt);
    }

    seen.delete(currentPrompt.id);
  }

  await buildGraph(parentPrompt, dependencies);

  return result;
}

export function resolveDependencyGraph(graph: PromptDependencyGraph) {
  function resolve(id: string) {
    const dependencyIds = graph.adjacencies[id] || [];
    const promptData = graph.prompts[id];

    if (!promptData.prompt)
      throw Error(
        `Missing prompt content for prompt ${promptData.name} v${promptData.version}`,
      );

    if (!dependencyIds.length) return promptData.prompt;

    let resolvedPrompt = JSON.stringify(promptData.prompt);

    for (const depId of dependencyIds) {
      const depPrompt = graph.prompts[depId];
      const resolvedDepPromptContent = resolve(depId);

      const versionPattern = `@@@langfusePrompt:name=${escapeRegex(depPrompt.name)}\\|version=${escapeRegex(depPrompt.version)}@@@`;
      const labelPatterns = depPrompt.labels.map(
        (label) =>
          `@@@langfusePrompt:name=${escapeRegex(depPrompt.name)}\\|label=${escapeRegex(label)}@@@`,
      );
      const combinedPattern = [versionPattern, ...labelPatterns].join("|");
      const regex = new RegExp(combinedPattern, "g");

      resolvedPrompt = resolvedPrompt.replace(regex, resolvedDepPromptContent);
    }

    return JSON.parse(resolvedPrompt);
  }

  return resolve(graph.rootId);
}

function escapeRegex(str: string | number) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// TODO: ensure that prompt names cannot contain '|' going forward
