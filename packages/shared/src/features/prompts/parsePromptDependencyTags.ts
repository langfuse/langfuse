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

  for (const match of new Set(matchedTags ?? [])) {
    const innerContent = match.replace(/^@@@langfusePrompt:|@@@$/g, "");
    const parts = innerContent.split("|");
    const params: Record<string, string> = {};

    // Check if the first parameter is name
    const firstPart = parts[0];
    if (!firstPart || !firstPart.startsWith("name=")) {
      continue; // Skip this tag if name is not the first parameter. This makes it easier to replace the tag with the resolved prompt.
    }

    // There can be only 2 parts
    if (parts.length !== 2) {
      continue;
    }

    parts.forEach((part) => {
      // Split at the first '=' only: prompt names may contain '=' themselves
      // (PromptNameSchema only bans '|'), so a later '=' belongs to the value.
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) return;
      params[part.slice(0, separatorIndex)] = part.slice(separatorIndex + 1);
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
