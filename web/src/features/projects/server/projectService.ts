import { randomUUID } from "crypto";
import { InternalServerError } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  ProjectDeleteQueue,
  QueueJobs,
  redis,
} from "@langfuse/shared/src/server";
import {
  GatewayConfigService,
  invalidateGatewayResolveCacheForOrganization,
} from "@/src/features/ai-gateway/server";
import { auditLog, type AuditLogActor } from "@/src/features/audit-logs/server";
import { ApiAuthService } from "@/src/features/public-api/server";
import { emitChbProjectEvent } from "@/src/ee/features/billing/server";

export class ProjectService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * delete soft-deletes a project and queues its hard delete. If the project
   * is the AI Gateway's ingestion project, it also turns the gateway off.
   * Callers must check `project:delete`, and `gateway:manage` when
   * `GatewayConfigService.isIngestionProject` is true.
   */
  async delete(params: {
    organizationId: string;
    projectId: string;
    actor: AuditLogActor;
  }) {
    const { organizationId, projectId } = params;
    const apiAuthService = new ApiAuthService(this.prisma, redis);

    // API keys need to be deleted from cache. Otherwise, they will still be valid.
    await apiAuthService.invalidateCachedProjectApiKeys(projectId);
    await this.prisma.apiKey.deleteMany({
      where: { projectId, scope: "PROJECT" },
    });

    const { project, clearedGateway } = await this.prisma.$transaction(
      async (tx) => {
        const clearedGateway = await new GatewayConfigService(
          tx,
        ).clearIngestionProject(params);
        const project = await tx.project.update({
          where: { id: projectId, orgId: organizationId },
          data: { deletedAt: new Date() },
        });
        return { project, clearedGateway };
      },
    );
    if (clearedGateway) {
      await invalidateGatewayResolveCacheForOrganization(organizationId);
    }

    await auditLog({
      ...params.actor,
      resourceType: "project",
      resourceId: projectId,
      before: project,
      action: "delete",
    });

    // Refresh org-scoped keys' baked projectIds now that a project is gone.
    await apiAuthService.invalidateCachedOrgApiKeys(organizationId);

    // Soft-delete is the billing-relevant moment: the customer stops being
    // billable now, not when the async hard-delete worker finishes.
    emitChbProjectEvent({
      type: "LANGFUSE_PROJECT_DELETED",
      orgId: organizationId,
      projectId,
    });

    const projectDeleteQueue = ProjectDeleteQueue.getInstance();
    if (!projectDeleteQueue) {
      throw new InternalServerError(
        "ProjectDeleteQueue is not available. Please try again later.",
      );
    }
    await projectDeleteQueue.add(QueueJobs.ProjectDelete, {
      timestamp: new Date(),
      id: randomUUID(),
      payload: { projectId, orgId: organizationId },
      name: QueueJobs.ProjectDelete,
    });
  }
}
