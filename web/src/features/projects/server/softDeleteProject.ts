import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  GatewayConfigService,
  invalidateGatewayResolveCacheForOrganization,
} from "@/src/features/ai-gateway/server";
import type { AuditLogActor } from "@/src/features/audit-logs/server";

/**
 * softDeleteProject marks a project deleted. If the project is the AI
 * Gateway's ingestion project, it also turns the gateway off. Callers must
 * check `gateway:manage` before deleting an ingestion project.
 */
export async function softDeleteProject(params: {
  prisma: PrismaClient;
  organizationId: string;
  projectId: string;
  actor: AuditLogActor;
}) {
  const { project, clearedGateway } = await params.prisma.$transaction(
    async (tx) => {
      const clearedGateway = await new GatewayConfigService(
        tx,
      ).clearIngestionProject({
        organizationId: params.organizationId,
        projectId: params.projectId,
        actor: params.actor,
      });
      const project = await tx.project.update({
        where: { id: params.projectId, orgId: params.organizationId },
        data: { deletedAt: new Date() },
      });
      return { project, clearedGateway };
    },
  );
  if (clearedGateway) {
    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
  }
  return project;
}
