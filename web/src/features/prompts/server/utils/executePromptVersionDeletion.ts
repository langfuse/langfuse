import { type PrismaClient, LATEST_PROMPT_LABEL } from "@langfuse/shared";
import { PromptService, redis } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { promptChangeEventSourcing } from "@/src/features/prompts/server/promptChangeEventSourcing";
import { type PromptVersionDeletionResult } from "./validatePromptVersionDeletion";

export type ExecutePromptVersionDeletionParams = {
  prisma: PrismaClient;
  projectId: string;
  orgId: string;
  apiKeyId?: string;
  sessionUserId?: string;
  validationResult: PromptVersionDeletionResult;
};

/**
 * Executes the prompt version deletion with all necessary side effects:
 * - Audit logging
 * - Cache management
 * - Database transaction
 * - Webhook events
 * 
 * This function is shared between TRPC and public API endpoints to ensure
 * consistent behavior.
 */
export async function executePromptVersionDeletion(
  params: ExecutePromptVersionDeletionParams,
): Promise<void> {
  const { 
    prisma, 
    projectId, 
    orgId, 
    apiKeyId, 
    sessionUserId,
    validationResult: { promptVersionToDelete, newLatestPrompt }
  } = params;

  const { name: promptName } = promptVersionToDelete;

  // Audit log before deletion - use appropriate variant based on available auth info
  if (apiKeyId) {
    // API key variant
    await auditLog({
      action: "delete",
      resourceType: "prompt",
      resourceId: promptVersionToDelete.id,
      apiKeyId,
      orgId,
      projectId,
      before: promptVersionToDelete,
    });
  } else if (sessionUserId) {
    // User session variant
    await auditLog({
      action: "delete",
      resourceType: "prompt",
      resourceId: promptVersionToDelete.id,
      userId: sessionUserId,
      orgId,
      projectId,
      before: promptVersionToDelete,
    });
  } else {
    // Fallback - this shouldn't happen in normal operation
    throw new Error("Either apiKeyId or sessionUserId must be provided for audit logging");
  }

  const transaction = [
    prisma.prompt.delete({
      where: {
        id: promptVersionToDelete.id,
        projectId,
      },
    }),
  ];

  // If the deleted prompt was the latest version, update the latest prompt
  if (newLatestPrompt) {
    transaction.push(
      prisma.prompt.update({
        where: {
          id: newLatestPrompt.id,
          projectId,
        },
        data: {
          labels: {
            push: LATEST_PROMPT_LABEL,
          },
        },
      }),
    );
  }

  // Lock and invalidate cache for _all_ versions and labels of the prompt
  const promptService = new PromptService(prisma, redis);
  await promptService.lockCache({ projectId, promptName });
  await promptService.invalidateCache({ projectId, promptName });

  try {
    // Execute transaction
    await prisma.$transaction(transaction);

    // Trigger webhooks for prompt version deletion
    await promptChangeEventSourcing(
      await promptService.resolvePrompt(promptVersionToDelete),
      "deleted",
    );
  } finally {
    // Always unlock cache, even if transaction fails
    await promptService.unlockCache({ projectId, promptName });
  }
}