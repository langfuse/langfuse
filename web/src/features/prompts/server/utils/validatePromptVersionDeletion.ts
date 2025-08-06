import { type PrismaClient, Prisma, LATEST_PROMPT_LABEL, type Prompt } from "@langfuse/shared";
import { ForbiddenError, LangfuseConflictError } from "@langfuse/shared";
import { checkHasProtectedLabels } from "./checkHasProtectedLabels";
import { type Session } from "next-auth";

export type PromptVersionDeletionValidationParams = {
  prisma: PrismaClient;
  projectId: string;
  promptName: string;
  version: number;
  /**
   * Optional session for RBAC checks. If provided, will throw TRPCError.
   * If not provided, will throw standard HTTP errors for API endpoints.
   * This should be the full TRPC session object from protectedProjectProcedure.
   */
  session?: Session & {
    user: {
      id: string;
      admin?: boolean;
    };
    orgId: string;
    projectId: string;
  };
};

export type PromptVersionDeletionResult = {
  promptVersionToDelete: Prompt; // Use full Prompt type instead of partial
  newLatestPrompt?: Prompt; // Use full Prompt type instead of partial
};

/**
 * Validates whether a prompt version can be deleted and returns the prompt data.
 * Throws appropriate errors if deletion is not allowed.
 * 
 * This function is shared between TRPC and public API endpoints to ensure
 * consistent validation logic.
 */
export async function validatePromptVersionDeletion(
  params: PromptVersionDeletionValidationParams,
): Promise<PromptVersionDeletionResult> {
  const { prisma, projectId, promptName, version, session } = params;

  // Find the prompt version to delete
  const promptVersionToDelete = await prisma.prompt.findFirstOrThrow({
    where: {
      name: promptName,
      version,
      projectId,
    },
  });

  const { name, labels } = promptVersionToDelete;

  // Check if prompt has a protected label
  const { hasProtectedLabels, protectedLabels } = await checkHasProtectedLabels({
    prisma,
    projectId,
    labelsToCheck: promptVersionToDelete.labels,
  });

  if (hasProtectedLabels) {
    const errorMessage = `You don't have permission to delete a prompt with a protected label. Please contact your project admin for assistance.\n\n Protected labels are: ${protectedLabels.join(", ")}`;
    
    if (session) {
      // For TRPC endpoints, we need to check RBAC and throw TRPCError
      const { throwIfNoProjectAccess } = await import("@/src/features/rbac/utils/checkProjectAccess");
      throwIfNoProjectAccess({
        session,
        projectId,
        scope: "promptProtectedLabels:CUD",
        forbiddenErrorMessage: errorMessage,
      });
    } else {
      // For API endpoints, throw HTTP error
      throw new ForbiddenError(errorMessage);
    }
  }

  // Check for dependencies if the prompt has labels
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
        AND pd.child_name = ${name}
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
            `${d.parent_name} v${d.parent_version} depends on ${name} ${d.child_version ? `v${d.child_version}` : d.child_label}`,
        )
        .join("\n");

      const errorMessage = `Other prompts are depending on the prompt version you are trying to delete:\n\n${dependencyMessages}\n\nPlease delete the dependent prompts first.`;

      if (session) {
        // For TRPC endpoints, throw TRPCError
        const { TRPCError } = await import("@trpc/server");
        throw new TRPCError({
          code: "CONFLICT",
          message: errorMessage,
        });
      } else {
        // For API endpoints, throw HTTP error
        throw new LangfuseConflictError(errorMessage);
      }
    }
  }

  // Find the new latest prompt if we're deleting the current latest
  let newLatestPrompt: PromptVersionDeletionResult["newLatestPrompt"];
  if (promptVersionToDelete.labels.includes(LATEST_PROMPT_LABEL)) {
    const foundLatestPrompt = await prisma.prompt.findFirst({
      where: {
        projectId,
        name: name,
        id: { not: promptVersionToDelete.id },
      },
      orderBy: [{ version: "desc" }],
    });

    if (foundLatestPrompt) {
      newLatestPrompt = foundLatestPrompt;
    }
  }

  return {
    promptVersionToDelete,
    newLatestPrompt,
  };
}