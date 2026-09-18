import { SkillDescriptionSchema, SkillNameSchema } from "@langfuse/shared";
import { parseDocument } from "yaml";

export type SkillFrontmatterMetadata = {
  name: string;
  description: string;
};

export function parseSkillFrontmatterMetadata(
  markdown: string,
): SkillFrontmatterMetadata | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!match) return null;

  const document = parseDocument(match[1] ?? "");
  if (document.errors.length > 0) return null;

  try {
    const value: unknown = document.toJS({ maxAliasCount: 50 });
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const frontmatter = value as Record<string, unknown>;
    const name = SkillNameSchema.safeParse(frontmatter.name);
    const description = SkillDescriptionSchema.safeParse(
      frontmatter.description,
    );

    return name.success && description.success
      ? { name: name.data, description: description.data }
      : null;
  } catch {
    return null;
  }
}
