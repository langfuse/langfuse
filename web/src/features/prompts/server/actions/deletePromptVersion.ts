import {
  prisma as _prisma,
  Prisma,
  type PrismaClient,
  type Prompt,
} from "@langfuse/shared/src/db";
import { redis, PromptService, logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { checkHasProtectedLabels } from "@/src/features/prompts/server/utils/checkHasProtectedLabels";
import {
  LATEST_PROMPT_LABEL,
  ForbiddenError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { promptChangeEventSourcing } from "@/src/features/prompts/server/promptChangeEventSourcing";

export type DeletePromptVersionParams = {
  projectId: string;
  promptVersionId: string;
  prisma?: PrismaClient;
  canDeleteProtectedLabel?: boolean;
  onBeforeDelete?: (prompt: Prompt) => Promise<void> | void;
  onAfterDelete?: (prompt: Prompt) => Promise<void> | void;
};

/**
 * Deletes a prompt version with full safety checks and side-effects (audit log via callbacks, cache invalidation, webhooks).
 */
export async function deletePromptVersion(params: DeletePromptVersionParams) {
  const prisma = params.prisma ?? _prisma;
  const projectId = params.projectId;

  // Resolve prompt version by id
  const promptVersion = await prisma.prompt.findFirst({
    where: { id: params.promptVersionId, projectId },
  });

  if (!promptVersion) {
    throw new LangfuseNotFoundError("Prompt not found");
  }

  const { name: promptName, version, labels } = promptVersion;

  // Protected label check
  const { hasProtectedLabels, protectedLabels } = await checkHasProtectedLabels(
    {
      prisma,
      projectId,
      labelsToCheck: labels,
    },
  );

  if (hasProtectedLabels && !params.canDeleteProtectedLabel) {
    throw new ForbiddenError(
      `You don't have permission to delete a prompt with a protected label. Please contact your project admin for assistance.\n\n Protected labels are: ${protectedLabels.join(", ")}`,
    );
  }

  // Dependency check only needed if labels exist
  if (labels.length > 0) {
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
        AND (
          (pd."child_version" IS NOT NULL AND pd."child_version" = ${version})
          OR
          (pd."child_label" IS NOT NULL AND pd."child_label" IN (${Prisma.join(labels)}))
        )
    `;

    if (dependents.length > 0) {
      const dependencyMessages = dependents
        .map(
          (d) =>
            `${d.parent_name} v${d.parent_version} depends on ${promptName} ${d.child_version ? `v${d.child_version}` : d.child_label}`,
        )
        .join("\n");

      throw new TRPCError({
        code: "CONFLICT",
        message: `Other prompts are depending on the prompt version you are trying to delete:\n\n${dependencyMessages}\n\nPlease delete the dependent prompts first.`,
      });
    }
  }

  // Allow caller to audit before deletion
  if (params.onBeforeDelete) await params.onBeforeDelete(promptVersion);

  const promptService = new PromptService(prisma, redis);

  try {
    // Lock and invalidate cache for all versions/labels of the prompt
    await promptService.lockCache({ projectId, promptName });
    await promptService.invalidateCache({ projectId, promptName });

    const transaction: Array<ReturnType<PrismaClient["$executeRaw"]> | any> = [
      prisma.prompt.delete({
        where: { id: promptVersion.id, projectId },
      }),
    ];

    // If deleted version carried the "latest" label, move it to the next latest
    if (promptVersion.labels.includes(LATEST_PROMPT_LABEL)) {
      const newLatestPrompt = await prisma.prompt.findFirst({
        where: {
          projectId,
          name: promptName,
          id: { not: promptVersion.id },
        },
        orderBy: [{ version: "desc" }],
      });

      if (newLatestPrompt) {
        transaction.push(
          prisma.prompt.update({
            where: { id: newLatestPrompt.id, projectId },
            data: { labels: { push: LATEST_PROMPT_LABEL } },
          }),
        );
      }
    }

    // Execute transaction
    await prisma.$transaction(transaction);

    // Unlock cache
    await promptService.unlockCache({ projectId, promptName });

    // Trigger webhooks for prompt version deletion
    await promptChangeEventSourcing(
      await promptService.resolvePrompt(promptVersion),
      "deleted",
    );

    // Allow caller to audit after deletion
    if (params.onAfterDelete) await params.onAfterDelete(promptVersion);
  } catch (e) {
    logger.error(e);
    // Always attempt to unlock cache
    try {
      await promptService.unlockCache({ projectId, promptName });
    } catch {}
    throw e;
  }

  return { id: promptVersion.id };
}
