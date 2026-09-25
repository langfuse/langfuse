import { type Prisma, Role } from "@langfuse/shared/src/db";
import { ForbiddenError, hasProjectAccessByRole } from "@langfuse/shared";
import { type ApiAccessLevel } from "@langfuse/shared/src/server";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { shadowAuthorize } from "@/src/features/public-api/server";
import { checkHasProtectedLabels } from "./checkHasProtectedLabels";

export type ApiKeyProjectContext = {
  projectId: string;
  orgId: string;
  apiKeyId: string;
  accessLevel: ApiAccessLevel;
};

/**
 * Resolve the in-app-agent key creator's project role the same way the worker
 * run executor does: user.admin bypasses membership; otherwise org membership
 * is required and a project membership override wins. Fail closed on missing
 * user, missing org membership, or NONE.
 */
async function resolveApiKeyCreatorProjectAccess(params: {
  prisma: Prisma.TransactionClient;
  userId: string;
  projectId: string;
  orgId: string;
}): Promise<{
  projectRole?: Role;
  isAdmin: boolean;
} | null> {
  const user = await params.prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, admin: true },
  });

  if (!user) {
    return null;
  }

  if (user.admin) {
    return { isAdmin: true };
  }

  const orgMembership = await params.prisma.organizationMembership.findFirst({
    where: { userId: params.userId, orgId: params.orgId },
  });

  if (!orgMembership) {
    return null;
  }

  const projectMembership = await params.prisma.projectMembership.findFirst({
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
  prisma: Prisma.TransactionClient;
  context: ApiKeyProjectContext;
  protectedLabels: string[];
  forbiddenErrorMessage: string;
}): Promise<void> {
  const apiKey = await params.prisma.apiKey.findUnique({
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
        prisma: params.prisma,
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

/** Authorize protected-label mutations for project API keys and their creators. */
export async function authorizeProtectedLabelMutation(params: {
  prisma: Prisma.TransactionClient;
  context: ApiKeyProjectContext;
  ctx?: AuthorizationContext;
  labelsToCheck: string[];
  forbiddenErrorMessage: string;
}): Promise<void> {
  const { hasProtectedLabels, protectedLabels } = await checkHasProtectedLabels(
    {
      prisma: params.prisma,
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
    prisma: params.prisma,
    context: params.context,
    protectedLabels,
    forbiddenErrorMessage: params.forbiddenErrorMessage,
  });
}
