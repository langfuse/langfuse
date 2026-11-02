import { type PrismaClient, type Role } from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";

type TransferProjectActor =
  | {
      session: {
        user: { id: string };
        orgId: string;
        orgRole?: Role;
        projectId?: string;
        projectRole?: Role;
      };
    }
  | { apiKeyId: string; orgId: string; projectId?: string };

/**
 * transferProject moves a project into another organization. The project
 * keeps its data and API keys and loses its memberships. A project that is
 * already in the target organization is left untouched. Callers must check
 * `projects:transfer_org` in both organizations.
 */
export async function transferProject(params: {
  prisma: PrismaClient;
  /** The organization the project belongs to before the transfer. */
  organizationId: string;
  targetOrganizationId: string;
  projectId: string;
  actor: TransferProjectActor;
}) {
  const { prisma, organizationId, targetOrganizationId, projectId } = params;
  if (organizationId === targetOrganizationId) return;

  await auditLog({
    ...params.actor,
    resourceType: "project",
    resourceId: projectId,
    action: "transfer",
    before: { orgId: organizationId },
    after: { orgId: targetOrganizationId },
  });

  await prisma.$transaction([
    prisma.projectMembership.deleteMany({
      where: {
        projectId,
      },
    }),
    prisma.project.update({
      where: {
        id: projectId,
        orgId: organizationId,
      },
      data: {
        orgId: targetOrganizationId,
      },
    }),
  ]);

  // API keys need to be deleted from cache. Otherwise, they will still be valid.
  // It has to be called after the db is done to prevent new API keys from being cached.
  await new ApiAuthService(prisma, redis).invalidateCachedProjectApiKeys(
    projectId,
  );
}
