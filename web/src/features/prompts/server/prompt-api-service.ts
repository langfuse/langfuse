import { prisma, Role } from "@langfuse/shared/src/db";
import {
  type CreatePromptSchema,
  type GetPromptByNameSchema,
  type GetPromptsMetaSchema,
  type Prompt,
  ForbiddenError,
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
  hasProjectAccessByRole,
} from "@langfuse/shared";
import { type ApiAccessLevel } from "@langfuse/shared/src/server";
import type { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/server";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { shadowAuthorize } from "@/src/features/public-api/server/shadowAuth";
import { createPrompt } from "./actions/createPrompt";
import { deletePrompt } from "./actions/deletePrompt";
import { getPromptByName } from "./actions/getPromptByName";
import { getPromptsMeta } from "./actions/getPromptsMeta";
import { updatePrompt } from "./actions/updatePrompts";
import { checkHasProtectedLabels } from "./utils/checkHasProtectedLabels";

type ApiKeyProjectContext = {
  projectId: string;
  orgId: string;
  apiKeyId: string;
  accessLevel: ApiAccessLevel;
};

type ListPromptsForApiInput = z.infer<typeof GetPromptsMetaSchema> & {
  projectId: string;
};

type GetPromptForApiInput = z.infer<typeof GetPromptByNameSchema> & {
  projectId: string;
};

export const listPromptsForApi = async (input: ListPromptsForApiInput) => {
  return await getPromptsMeta(input);
};

export const getPromptForApi = async (input: GetPromptForApiInput) => {
  return await getPromptByName(input);
};

/**
 * Resolve the in-app-agent key creator's project role the same way the worker
 * run executor does: user.admin bypasses membership; otherwise org membership
 * is required and a project membership override wins. Fail closed on missing
 * user, missing org membership, or NONE.
 */
async function resolveApiKeyCreatorProjectAccess(params: {
  userId: string;
  projectId: string;
  orgId: string;
}): Promise<{
  projectRole?: Role;
  isAdmin: boolean;
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, admin: true },
  });

  if (!user) {
    return null;
  }

  if (user.admin) {
    return { isAdmin: true };
  }

  const orgMembership = await prisma.organizationMembership.findFirst({
    where: { userId: params.userId, orgId: params.orgId },
  });

  if (!orgMembership) {
    return null;
  }

  const projectMembership = await prisma.projectMembership.findFirst({
    where: {
      userId: params.userId,
      projectId: params.projectId,
      orgMembershipId: orgMembership.id,
    },
  });

  const projectRole = projectMembership?.role ?? orgMembership.role;

  if (projectRole === Role.NONE) {
    return null;
  }

  return {
    projectRole,
    isAdmin: false,
  };
}

/**
 * Ordinary project API keys may still promote protected labels (CI). Temporary
 * in-app-agent keys must honor the creator's promptProtectedLabels:CUD right.
 * Call after checkHasProtectedLabels; skip when that result is false.
 */
async function assertInAppAgentMayMutateProtectedLabels(params: {
  context: ApiKeyProjectContext;
  protectedLabels: string[];
  forbiddenErrorMessage: string;
}): Promise<void> {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: params.context.apiKeyId },
    select: {
      isInAppAgentKey: true,
      createdByUserId: true,
    },
  });

  if (!apiKey?.isInAppAgentKey) {
    return;
  }

  const access = apiKey.createdByUserId
    ? await resolveApiKeyCreatorProjectAccess({
        userId: apiKey.createdByUserId,
        projectId: params.context.projectId,
        orgId: params.context.orgId,
      })
    : null;

  const mayMutateProtectedLabels =
    access !== null &&
    hasProjectAccessByRole({
      role: access.projectRole ?? Role.MEMBER,
      admin: access.isAdmin,
      scope: "promptProtectedLabels:CUD",
    });

  if (!mayMutateProtectedLabels) {
    throw new ForbiddenError(
      `${params.forbiddenErrorMessage}\n\n Protected labels are: ${params.protectedLabels.join(", ")}`,
    );
  }
}

/** authorizeProtectedLabelMutation runs the per-item seam and the in-app-agent creator check when the label set includes a protected label. */
async function authorizeProtectedLabelMutation(params: {
  context: ApiKeyProjectContext;
  ctx?: AuthorizationContext;
  labelsToCheck: string[];
  forbiddenErrorMessage: string;
}): Promise<void> {
  const { hasProtectedLabels, protectedLabels } = await checkHasProtectedLabels(
    {
      prisma,
      projectId: params.context.projectId,
      labelsToCheck: params.labelsToCheck,
    },
  );

  if (!hasProtectedLabels) {
    return;
  }

  const decision = shadowAuthorize({
    ctx: params.ctx,
    action: "promptProtectedLabels:CUD",
    resource: { projectId: params.context.projectId },
    accessLevel: params.context.accessLevel,
  });
  if (!decision.success) throw decision.error;

  await assertInAppAgentMayMutateProtectedLabels({
    context: params.context,
    protectedLabels,
    forbiddenErrorMessage: params.forbiddenErrorMessage,
  });
}

export const createPromptForApi = async ({
  context,
  input,
  ctx,
}: {
  context: ApiKeyProjectContext;
  input: z.infer<typeof CreatePromptSchema>;
  ctx?: AuthorizationContext;
}) => {
  await authorizeProtectedLabelMutation({
    context,
    ctx,
    labelsToCheck: input.labels ?? [],
    forbiddenErrorMessage:
      "You don't have permission to create a prompt with a protected label. Please contact your project admin for assistance.",
  });

  const createdPrompt = await createPrompt({
    ...input,
    config: input.config ?? {},
    projectId: context.projectId,
    createdBy: "API",
    prisma,
  }).catch((err) => {
    const promptVersionConflictMessage = `Failed to create prompt '${input.name}' due to unique constraint failure. This is likely due to too many concurrent prompt creations for this prompt name. Please add a delay.`;

    if (err instanceof LangfuseConflictError) {
      throw new InvalidRequestError(promptVersionConflictMessage);
    }

    if (
      typeof err === "object" &&
      err?.constructor.name === "PrismaClientKnownRequestError" &&
      "code" in err &&
      // Unique constraint failed: https://www.prisma.io/docs/orm/reference/error-reference#p2002
      err.code === "P2002"
    ) {
      throw new InvalidRequestError(promptVersionConflictMessage);
    }

    throw err;
  });

  await auditLog({
    action: "create",
    resourceType: "prompt",
    resourceId: createdPrompt.id,
    projectId: context.projectId,
    orgId: context.orgId,
    apiKeyId: context.apiKeyId,
    after: createdPrompt,
  });

  return createdPrompt;
};

export const updatePromptLabelsForApi = async ({
  context,
  promptName,
  promptVersion,
  newLabels,
  ctx,
}: {
  context: ApiKeyProjectContext;
  promptName: string;
  promptVersion: number;
  newLabels: string[];
  ctx?: AuthorizationContext;
}) => {
  const existingPrompt = await prisma.prompt.findUnique({
    where: {
      projectId_name_version: {
        projectId: context.projectId,
        name: promptName,
        version: promptVersion,
      },
    },
  });

  if (!existingPrompt) {
    throw new LangfuseNotFoundError(
      `Prompt '${promptName}' version ${promptVersion} not found in project`,
    );
  }

  // updatePrompt is additive; labels already on this version are not a
  // mutation. Moving a protected label onto this version still counts as add.
  const addedLabels = newLabels.filter(
    (label) => !existingPrompt.labels.includes(label),
  );

  await authorizeProtectedLabelMutation({
    context,
    ctx,
    labelsToCheck: addedLabels,
    forbiddenErrorMessage:
      "You don't have permission to add a protected label to a prompt. Please contact your project admin for assistance.",
  });

  const updatedPrompt = await updatePrompt({
    promptName,
    projectId: context.projectId,
    promptVersion,
    newLabels,
  });

  await auditLog({
    action: "update",
    resourceType: "prompt",
    resourceId: updatedPrompt.id,
    projectId: context.projectId,
    orgId: context.orgId,
    apiKeyId: context.apiKeyId,
    before: existingPrompt ?? undefined,
    after: updatedPrompt,
  });

  return { existingPrompt, updatedPrompt } satisfies {
    existingPrompt: Prompt;
    updatedPrompt: Prompt;
  };
};

export const deletePromptForApi = async ({
  context,
  promptName,
  version,
  label,
  ctx,
}: {
  context: ApiKeyProjectContext;
  promptName: string;
  version?: number | null;
  label?: string;
  ctx?: AuthorizationContext;
}) => {
  const where = {
    projectId: context.projectId,
    name: promptName,
    ...(version ? { version } : {}),
    ...(label ? { labels: { has: label } } : {}),
  };

  const prompts = await prisma.prompt.findMany({ where });

  await authorizeProtectedLabelMutation({
    context,
    ctx,
    labelsToCheck: prompts.flatMap((prompt) => prompt.labels),
    forbiddenErrorMessage:
      "You don't have permission to delete a prompt with a protected label. Please contact your project admin for assistance.",
  });

  for (const prompt of prompts) {
    await auditLog({
      action: "delete",
      resourceType: "prompt",
      resourceId: prompt.id,
      projectId: context.projectId,
      orgId: context.orgId,
      apiKeyId: context.apiKeyId,
      before: prompt,
    });
  }

  await deletePrompt({
    promptName,
    projectId: context.projectId,
    version,
    label,
    promptVersions: prompts,
  });
};
