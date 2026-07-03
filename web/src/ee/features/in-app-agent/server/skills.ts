import { createSkill } from "@mastra/core/skills";
import { parse } from "yaml";

import { LANGFUSE_IN_APP_AGENT_SKILL_MARKDOWN } from "./skills/generated/skill-markdown";

type LangfuseInAppAgentSkillDefinition = {
  name: string;
  description: string;
  instructions: string;
};

function parseSkillMarkdown(
  markdown: unknown,
): LangfuseInAppAgentSkillDefinition {
  if (typeof markdown !== "string") {
    throw new Error(
      "In-app agent skill markdown import did not resolve to a string.",
    );
  }

  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!frontmatterMatch) {
    throw new Error("In-app agent skill is missing frontmatter.");
  }

  const metadata = parseFrontmatter(frontmatterMatch[1] ?? "");
  const instructions = markdown.slice(frontmatterMatch[0].length).trim();

  if (!metadata.name) {
    throw new Error("In-app agent skill frontmatter is missing name.");
  }

  if (!metadata.description) {
    throw new Error("In-app agent skill frontmatter is missing description.");
  }

  if (!instructions) {
    throw new Error("In-app agent skill is missing instructions.");
  }

  return {
    name: metadata.name,
    description: metadata.description,
    instructions,
  };
}

function parseFrontmatter(frontmatter: string): Record<string, string> {
  const parsed = parse(frontmatter);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("In-app agent skill frontmatter must be a YAML object.");
  }

  const metadata = parsed as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
}

export const LANGFUSE_IN_APP_AGENT_SKILLS =
  LANGFUSE_IN_APP_AGENT_SKILL_MARKDOWN.map(({ markdown }) =>
    createSkill(parseSkillMarkdown(markdown)),
  );
