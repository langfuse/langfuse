import { type Prompt, prisma } from "@langfuse/shared/src/db";
import { z } from "zod";

export const PromptDependencyRegex = /@@@langfusePrompt:(.*?)@@@/g;

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
  content: string | object,
): ParsedPromptDependencyTag[] {
  const matchedTags = JSON.stringify(content).match(PromptDependencyRegex);

  const validTags: ParsedPromptDependencyTag[] = [];

  for (const match of matchedTags ?? []) {
    const innerContent = match.replace(/^@@@langfusePrompt:|@@@$/g, "");
    const parts = innerContent.split("|");
    const params: Record<string, string> = {};

    // Check if the first parameter is name
    const firstPart = parts[0];
    if (!firstPart || !firstPart.startsWith("name=")) {
      continue; // Skip this tag if name is not the first parameter. This makes it easier to replace the tag with the resolved prompt.
    }

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
  adjacencies: Record<string, Pick<Prompt, "id" | "version" | "name">[]>;
  resolvedPrompt: Prompt["prompt"];
};

export async function buildAndResolvePromptGraph(params: {
  projectId: string;
  parentPrompt: PartialPrompt;
  dependencies?: ParsedPromptDependencyTag[];
}): Promise<PromptDependencyGraph> {
  const { projectId, parentPrompt, dependencies } = params;

  const adjacencies: PromptDependencyGraph["adjacencies"] = {};

  const seen = new Set<string>();

  async function resolve(
    currentPrompt: PartialPrompt,
    deps?: ParsedPromptDependencyTag[],
  ) {
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
        adjacencies[currentPrompt.id] ??= [];
        adjacencies[currentPrompt.id].push({
          id: depPrompt.id,
          name: depPrompt.name,
          version: depPrompt.version,
        });

        // resolve the prompt content recursively
        const resolvedDepPrompt = await resolve(depPrompt);

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

  const resolvedPrompt = await resolve(parentPrompt, dependencies);

  return {
    adjacencies,
    resolvedPrompt,
  };
}

function escapeRegex(str: string | number) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// TODO: ensure that prompt names cannot contain '|' going forward
