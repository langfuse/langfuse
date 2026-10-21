import { createSkill } from "@mastra/core/skills";
import pLimit from "p-limit";
import { z } from "zod/v4";
import { ListSkillsResponseSchema, SkillVersionSchema } from "@langfuse/shared";
import { getProductBaseUrl, logger } from "@langfuse/shared/src/server";

import { LANGFUSE_SKILLS } from "@repo/langfuse-skills";

export const LANGFUSE_IN_APP_AGENT_SKILLS = LANGFUSE_SKILLS.map((skill) =>
  createSkill(skill),
);

const skillWithContentsSchema = SkillVersionSchema.extend({
  files: z.array(
    SkillVersionSchema.shape.files.element.extend({ content: z.string() }),
  ),
});

type SkillsConfig = {
  tag?: string;
  baseUrl?: string;
  publicKey?: string;
  secretKey?: string;
  signal?: AbortSignal;
};

/** Merge hosted instructions into bundled skills, with hosted names taking precedence. */
export async function loadInAppAgentSkills(config: SkillsConfig): Promise<{
  skills: typeof LANGFUSE_IN_APP_AGENT_SKILLS;
}> {
  if (!config.tag) return { skills: LANGFUSE_IN_APP_AGENT_SKILLS };

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    timeout = setTimeout(
      () => controller.abort(new Error("Managed assistant skills timed out")),
      5_000,
    );
    const signal = config.signal
      ? AbortSignal.any([config.signal, controller.signal])
      : controller.signal;
    const { skills: managedSkills } = await loadManagedCatalogue(
      { ...config, signal },
      config.tag,
    );
    signal.throwIfAborted();
    return {
      skills: [
        ...new Map(
          [...LANGFUSE_IN_APP_AGENT_SKILLS, ...managedSkills].map((skill) => [
            skill.name,
            skill,
          ]),
        ).values(),
      ],
    };
  } catch (error) {
    logger.warn(
      "Failed to load managed assistant skills; using bundled skills",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    );
    return { skills: LANGFUSE_IN_APP_AGENT_SKILLS };
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

async function loadManagedCatalogue(config: SkillsConfig, tag: string) {
  if (!config.publicKey || !config.secretKey) {
    throw new Error(
      "Managed assistant skills require AI-features project credentials",
    );
  }

  const host = config.baseUrl ?? getProductBaseUrl().toString();
  const baseUrl = new URL(`${host.replace(/\/+$/, "")}/api/public/skills`);
  const headers = {
    Authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString("base64")}`,
  };
  const read = async (url: URL): Promise<unknown> => {
    config.signal?.throwIfAborted();
    const response = await fetch(url, {
      headers,
      // A configured host must not forward project credentials to a redirect target.
      redirect: "error",
      signal: config.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Could not load managed assistant skills (HTTP ${response.status})`,
      );
    }
    return response.json();
  };

  const limit = pLimit(5);
  let skills: ReturnType<typeof createSkill>[] = [];
  for (let page = 1; ; page++) {
    const listUrl = new URL(baseUrl);
    listUrl.search = new URLSearchParams({
      tag,
      page: String(page),
      limit: "100",
    }).toString();
    const catalogue = ListSkillsResponseSchema.parse(await read(listUrl));
    const batch = await Promise.all(
      catalogue.data
        .filter((entry) => entry.productionVersion !== null)
        .map((entry) =>
          limit(async () => {
            const url = new URL(baseUrl);
            url.pathname += `/${encodeURIComponent(entry.name)}`;
            url.search = new URLSearchParams({
              version: String(entry.productionVersion),
              includeContent: "true",
            }).toString();
            const version = skillWithContentsSchema.parse(await read(url));
            if (
              version.name !== entry.name ||
              version.version !== entry.productionVersion
            ) {
              throw new Error(
                "Managed assistant skill did not match its selected version",
              );
            }
            const skillMd = version.files.find(
              (file) => file.path === "SKILL.md",
            );
            const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(
              skillMd?.content ?? "",
            );
            if (!skillMd || !frontmatter) {
              throw new Error(
                `Managed assistant skill ${entry.name} is missing a valid SKILL.md`,
              );
            }
            return createSkill({
              name: version.name,
              description: version.description,
              instructions: skillMd.content.slice(frontmatter[0].length),
              metadata: {
                langfuseProjectId: version.projectId,
                langfuseSkillId: version.id,
                langfuseSkillVersion: version.version,
              },
            });
          }),
        ),
    );
    skills = skills.concat(batch);
    if (!catalogue.meta.hasNextPage) break;
  }
  return { skills };
}
