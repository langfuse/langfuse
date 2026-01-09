import { prisma } from "@langfuse/shared/src/db";

export type PromptFilterOptionsResult = {
  name: { value: string }[];
  tags: { value: string }[];
  labels: { value: string }[];
};

/**
 * Returns prompt filter options (names/tags/labels) for a project.
 *
 * Mirrors the internal tRPC implementation `prompts.filterOptions` so
 * external services (e.g. a backend proxy) can fetch structure efficiently
 * without calling /api/trpc endpoints that require NextAuth sessions.
 */
export async function getPromptFilterOptions(params: {
  projectId: string;
}): Promise<PromptFilterOptionsResult> {
  const { projectId } = params;

  const [names, tags, labels] = await Promise.all([
    prisma.prompt.groupBy({
      where: { projectId },
      by: ["name"],
      // Limiting to 1k prompt names to avoid performance issues and response size limits.
      take: 1000,
      orderBy: { name: "asc" },
    }),
    prisma.$queryRaw<{ value: string }[]>`
      SELECT tags.tag as value
      FROM prompts, UNNEST(prompts.tags) AS tags(tag)
      WHERE prompts.project_id = ${projectId}
      GROUP BY tags.tag
      ORDER BY tags.tag ASC;
    `,
    prisma.$queryRaw<{ value: string }[]>`
      SELECT labels.label as value
      FROM prompts, UNNEST(prompts.labels) AS labels(label)
      WHERE prompts.project_id = ${projectId}
      GROUP BY labels.label
      ORDER BY labels.label ASC;
    `,
  ]);

  return {
    name: names
      .filter((n) => n.name !== null)
      .map((n) => ({ value: n.name ?? "undefined" })),
    tags,
    labels,
  };
}

