import { type Prompt, prisma } from "@langfuse/shared/src/db";
import { ParsedPromptDependencyTag } from "@langfuse/shared";

export const MAX_PROMPT_NESTING_DEPTH = 5;

type PartialPrompt = Pick<
  Prompt,
  "id" | "prompt" | "name" | "version" | "labels"
>;

type PromptReference = Pick<Prompt, "id" | "version" | "name">;
export type PromptGraph = {
  root: PromptReference;
  dependencies: Record<string, PromptReference[]>;
};

export type ResolvedPromptGraph = {
  graph: PromptGraph | null;
  resolvedPrompt: Prompt["prompt"];
};

export async function buildAndResolvePromptGraph(params: {
  projectId: string;
  parentPrompt: PartialPrompt;
  dependencies?: ParsedPromptDependencyTag[];
}): Promise<ResolvedPromptGraph> {
  const { projectId, parentPrompt, dependencies } = params;

  const graph: PromptGraph = {
    root: {
      name: parentPrompt.name,
      version: parentPrompt.version,
      id: parentPrompt.id,
    },
    dependencies: {},
  };
  const seen = new Set<string>();

  async function resolve(
    currentPrompt: PartialPrompt,
    deps: ParsedPromptDependencyTag[] | undefined,
    level: number,
  ) {
    // Nesting depth check
    if (level >= MAX_PROMPT_NESTING_DEPTH) {
      throw Error(
        `Maximum nesting depth exceeded (${MAX_PROMPT_NESTING_DEPTH})`,
      );
    }

    // Circular dependency check
    if (
      seen.has(currentPrompt.id) ||
      (currentPrompt.name === parentPrompt.name &&
        currentPrompt.id !== parentPrompt.id)
    ) {
      throw Error(
        `Circular dependency detected involving prompt '${currentPrompt.name}' version ${currentPrompt.version}`,
      );
    }

    seen.add(currentPrompt.id);

    // deps can be either passed (if a prompt is created and content was scanned) or retrieved from db
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

    if (promptDependencies && promptDependencies.length) {
      // Instantiate resolved prompt, use stringfied version for regex operations
      // Do this inside if clause to skip stringify/parse overhead for prompts without dependencies
      let resolvedPrompt = JSON.stringify(currentPrompt.prompt);

      for (const dep of promptDependencies) {
        const depPrompt = await prisma.prompt.findFirst({
          where: {
            projectId,
            name: dep.name,
            ...(dep.type === "version"
              ? { version: dep.version }
              : { labels: { has: dep.label } }),
          },
        });

        const logName = `${dep.name} - ${dep.type} ${dep.type === "version" ? dep.version : dep.label}`;

        if (!depPrompt) throw Error(`Prompt dependency not found: ${logName}`);
        if (depPrompt.type !== "text")
          throw Error(`Prompt dependency is not a text prompt: ${logName}`);

        // side-effect: populate adjacency list to return later as well
        graph.dependencies[currentPrompt.id] ??= [];
        graph.dependencies[currentPrompt.id].push({
          id: depPrompt.id,
          name: depPrompt.name,
          version: depPrompt.version,
        });

        // resolve the prompt content recursively
        const resolvedDepPrompt = await resolve(
          depPrompt,
          undefined,
          level + 1,
        );

        const versionPattern = `@@@langfusePrompt:name=${escapeRegex(depPrompt.name)}\\|version=${escapeRegex(depPrompt.version)}@@@`;
        const labelPatterns = depPrompt.labels.map(
          (label) =>
            `@@@langfusePrompt:name=${escapeRegex(depPrompt.name)}\\|label=${escapeRegex(label)}@@@`,
        );
        const combinedPattern = [versionPattern, ...labelPatterns].join("|");
        const regex = new RegExp(combinedPattern, "g");

        resolvedPrompt = resolvedPrompt.replace(regex, resolvedDepPrompt);
      }

      seen.delete(currentPrompt.id);

      return JSON.parse(resolvedPrompt);
    } else {
      seen.delete(currentPrompt.id);

      return currentPrompt.prompt;
    }
  }

  const resolvedPrompt = await resolve(parentPrompt, dependencies, 0);

  return {
    graph: Object.keys(graph.dependencies).length > 0 ? graph : null,
    resolvedPrompt,
  };
}

function escapeRegex(str: string | number) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
