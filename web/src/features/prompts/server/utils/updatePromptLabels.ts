import { type PrismaClient } from "@langfuse/shared/src/db";
import { isOceanBase } from "@langfuse/shared/src/server";
import { Prisma } from "@langfuse/shared/src/db";

export const removeLabelsFromPreviousPromptVersions = async ({
  prisma,
  projectId,
  promptName,
  labelsToRemove,
}: {
  prisma: Omit<
    PrismaClient,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >;
  projectId: string;
  promptName: string;
  labelsToRemove: string[];
}) => {
  if (labelsToRemove.length === 0) {
    return { touchedPromptIds: [], updates: [] };
  }
  let previouslyLabeledPrompts;
  // Use raw SQL query to check if labels array contains any of the labelsToRemove
  // This works for both PostgreSQL (ClickHouse) and MySQL/OceanBase
  if (isOceanBase()) {
    const conditionParts = labelsToRemove.map(
      (label) =>
        Prisma.sql`JSON_SEARCH(labels, 'one', ${label}, NULL, '$[*]') IS NOT NULL`,
    );
    const previouslyLabeledPromptsRaw = await prisma.$queryRaw<
      Array<{
        id: string;
        labels: unknown; // JSON type in OceanBase, String[] in PostgreSQL
        version: number;
      }>
    >`
      SELECT id, labels, version
      FROM prompts
      WHERE project_id = ${projectId}
      AND name = ${promptName}
      ${conditionParts.length > 0 ? Prisma.sql`AND (${Prisma.join(conditionParts, " OR ")})` : Prisma.empty}
      ORDER BY version DESC
    `;
    // Convert labels to string[] for OceanBase (JSON -> string[])
    previouslyLabeledPrompts = previouslyLabeledPromptsRaw.map((p) => ({
      id: p.id,
      labels: Array.isArray(p.labels) ? (p.labels as string[]) : [],
      version: p.version,
    }));
  } else {
    previouslyLabeledPrompts = await prisma.prompt.findMany({
      where: {
        projectId,
        name: promptName,
        // @ts-ignore
        labels: { hasSome: labelsToRemove },
      },
      orderBy: [{ version: "desc" }],
    });
  }

  const touchedPromptIds = previouslyLabeledPrompts.map(
    (prevPrompt) => prevPrompt.id,
  );

  return {
    touchedPromptIds,
    updates: previouslyLabeledPrompts.map((prevPrompt) =>
      prisma.prompt.update({
        where: { id: prevPrompt.id },
        data: {
          labels: (prevPrompt.labels as string[]).filter(
            (prevLabel) => !labelsToRemove.includes(prevLabel),
          ),
        },
      }),
    ),
  };
};
