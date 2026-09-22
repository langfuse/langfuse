import { SkillDescriptionSchema, SkillNameSchema } from "@langfuse/shared";
import { isMap, isScalar, parseDocument } from "yaml";

export type SkillFrontmatterMetadata = {
  name: string;
  description?: string;
  nameError: string | null;
};

export const SKILL_NAME_RULES =
  "Use 1–64 characters: lowercase letters, numbers, and single hyphens between words. Names cannot start or end with a hyphen.";

export function parseSkillFrontmatterMetadata(
  markdown: string,
): SkillFrontmatterMetadata | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!match) return null;

  const document = parseDocument(match[1] ?? "");
  const nameNode = isMap(document.contents)
    ? document.get("name", true)
    : undefined;
  let displayName = "";
  if (isScalar(nameNode)) {
    displayName =
      typeof nameNode.value === "string"
        ? nameNode.value
        : (nameNode.source ?? "");
  }
  const invalidFrontmatter = {
    name: displayName,
    nameError: `Fix the YAML frontmatter in SKILL.md. ${SKILL_NAME_RULES}`,
  };
  if (document.errors.length > 0) return invalidFrontmatter;

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

    return {
      name:
        typeof frontmatter.name === "string" ? frontmatter.name : displayName,
      description: description.success ? description.data : undefined,
      nameError: name.success ? null : SKILL_NAME_RULES,
    };
  } catch {
    return invalidFrontmatter;
  }
}
