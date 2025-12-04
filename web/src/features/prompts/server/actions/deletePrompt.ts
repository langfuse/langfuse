import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { prisma, type Prompt } from "@langfuse/shared/src/db";
import { PromptService, redis, logger } from "@langfuse/shared/src/server";

export type DeletePromptParams = {
  promptName: string;
  projectId: string;
  version?: number | null;
  label?: string;
  prompts?: Prompt[]; // Optional: if already fetched, avoid duplicate query
};

export const deletePrompt = async (params: DeletePromptParams) => {
  const {
    promptName,
    projectId,
    version,
    label,
    prompts: providedPrompts,
  } = params;

  if (version && label) {
    throw new InvalidRequestError("Cannot specify both version and label");
  }

  let prompts = providedPrompts;
  if (!prompts) {
    const where = {
      projectId,
      name: promptName,
      ...(version ? { version } : {}),
      ...(label ? { labels: { has: label } } : {}),
    };

    prompts = await prisma.prompt.findMany({ where });
  }

  if (prompts.length === 0) {
    throw new LangfuseNotFoundError("Prompt not found");
  }

  // Check if other prompts depend on the prompt(s) being deleted
  const dependents = await prisma.$queryRaw<
    {
      parent_name: string;
      parent_version: number;
      child_version: number;
      child_label: string;
    }[]
  >`
    SELECT
      p."name" AS "parent_name",
      p."version" AS "parent_version",
      pd."child_version" AS "child_version",
      pd."child_label" AS "child_label"
    FROM
      prompt_dependencies pd
      INNER JOIN prompts p ON p.id = pd.parent_id
    WHERE
      p.project_id = ${projectId}
      AND pd.project_id = ${projectId}
      AND pd.child_name = ${promptName}
  `;

  if (dependents.length > 0) {
    const dependencyMessages = dependents
      .map(
        (d) =>
          `${d.parent_name} v${d.parent_version} depends on ${promptName} ${d.child_version ? `v${d.child_version}` : d.child_label}`,
      )
      .join("\n");

    throw new InvalidRequestError(
      `Other prompts are depending on prompt versions you are trying to delete:\n\n${dependencyMessages}\n\nPlease delete the dependent prompts first.`,
    );
  }

  const promptService = new PromptService(prisma, redis);

  try {
    await promptService.lockCache({ projectId, promptName });
    await promptService.invalidateCache({ projectId, promptName });

    await prisma.prompt.deleteMany({
      where: { projectId, id: { in: prompts.map((p) => p.id) } },
    });
  } catch (err) {
    logger.error("Failed to delete prompt", err);
    throw err;
  } finally {
    await promptService.unlockCache({ projectId, promptName });
  }
};
