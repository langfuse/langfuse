import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { prisma, type Prompt } from "@langfuse/shared/src/db";
import { PromptService, redis, logger } from "@langfuse/shared/src/server";

export type DeletePromptParams = {
  promptName: string;
  projectId: string;
  version?: number | null;
  label?: string;
  promptVersions: Prompt[];
};

export const deletePrompt = async (params: DeletePromptParams) => {
  const { promptName, projectId, version, label, promptVersions } = params;

  if (version && label) {
    throw new InvalidRequestError("Cannot specify both version and label");
  }

  if (promptVersions.length === 0) {
    throw new LangfuseNotFoundError("Prompt not found");
  }

  // Check if other prompts depend on the specific prompt versions being deleted
  const dependents = await prisma.$queryRaw<
    {
      parent_id: string;
      child_version: number;
      child_label: string;
    }[]
  >`
    SELECT
      pd.parent_id,
      pd."child_version" AS "child_version",
      pd."child_label" AS "child_label"
    FROM
      prompt_dependencies pd
    WHERE
      pd.project_id = ${projectId}
      AND pd.child_name = ${promptName}
  `;

  // Get all existing versions to check which labels will cease to exist
  const allVersions = await prisma.prompt.findMany({
    where: { projectId, name: promptName },
    select: { id: true, version: true, labels: true },
  });

  const versionIdsBeingDeleted = new Set(promptVersions.map((p) => p.id));
  const versionsBeingDeleted = new Set(promptVersions.map((p) => p.version));

  const remainingVersions = allVersions.filter(
    (v) => !versionIdsBeingDeleted.has(v.id),
  );

  // only get dependencies that will actually break
  const blockingDependents = dependents.filter((dep) => {
    // block if we're deleting this specific version
    if (dep.child_version && versionsBeingDeleted.has(dep.child_version)) {
      return true;
    }
    // block only if no remaining version has this label
    if (dep.child_label) {
      const labelWillExist = remainingVersions.some((v) =>
        v.labels.includes(dep.child_label),
      );
      return !labelWillExist;
    }
    return false;
  });

  if (blockingDependents.length > 0) {
    // we want the parent prompt names to display understandable error messages
    const parentPrompts = await prisma.prompt.findMany({
      where: { id: { in: blockingDependents.map((d) => d.parent_id) } },
      select: { id: true, name: true, version: true },
    });

    const dependencyMessages = blockingDependents
      .map((d) => {
        const parent = parentPrompts.find((p) => p.id === d.parent_id);
        const parentInfo = parent
          ? `${parent.name} v${parent.version}`
          : d.parent_id;
        return `${parentInfo} depends on ${promptName} ${d.child_version ? `v${d.child_version}` : d.child_label}`;
      })
      .join("\n");

    throw new InvalidRequestError(
      `Other prompts are depending on prompt versions you are trying to delete:\n\n${dependencyMessages}\n\nPlease delete the dependent prompts first.`,
    );
  }

  const promptService = new PromptService(prisma, redis);

  try {
    await promptService.lockCache({ projectId, promptName });
    await promptService.invalidateCache({ projectId, promptName });

    const deletingLatest = promptVersions.some((p) =>
      p.labels.includes("latest"),
    );
    const latestRemainsAfterDeletion = remainingVersions.some((v) =>
      v.labels.includes("latest"),
    );

    // reattach "latest" to highest remaining version
    if (
      deletingLatest &&
      !latestRemainsAfterDeletion &&
      remainingVersions.length > 0
    ) {
      const highestRemainingVersion = remainingVersions.reduce((max, v) =>
        v.version > max.version ? v : max,
      );

      await prisma.prompt.update({
        where: { id: highestRemainingVersion.id },
        data: {
          labels: [...new Set([...highestRemainingVersion.labels, "latest"])],
        },
      });
    }

    await prisma.prompt.deleteMany({
      where: { projectId, id: { in: promptVersions.map((p) => p.id) } },
    });
  } catch (err) {
    logger.error("Failed to delete prompt", err);
    throw err;
  } finally {
    await promptService.unlockCache({ projectId, promptName });
  }
};
