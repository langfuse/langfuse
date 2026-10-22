import { randomUUID } from "crypto";
import { ForbiddenError, InternalServerError } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { ProjectDeleteQueue, QueueJobs } from "@langfuse/shared/src/server";
import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";
import { invalidateGatewayResolveCacheForOrganization } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import {
  auditLog,
  type AuditLogActor,
} from "@/src/features/audit-logs/auditLog";
import type { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { emitChbProjectEvent } from "@/src/ee/features/billing/server/chb/chbProjectEvents";

type DeleteProjectParams = {
  organizationId: string;
  projectId: string;
  actor: AuditLogActor;
  /** Whether the actor holds `gateway:manage`, required to delete the gateway's ingestion project. */
  canManageGateway: boolean;
};

export class ProjectService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly apiAuthService: ApiAuthService,
  ) {}

  /**
   * delete soft-deletes a project and queues its hard delete. If the project
   * is the AI Gateway's ingestion project, it also turns the gateway off.
   * Callers must check `project:delete`.
   */
  async delete(params: DeleteProjectParams) {
    // API keys need to be deleted from cache. Otherwise, they will still be valid.
    await this.apiAuthService.invalidateCachedProjectApiKeys(params.projectId);
    const project = await this.softDeleteAndUnlinkGateway(params);
    await auditLog({
      ...params.actor,
      resourceType: "project",
      resourceId: params.projectId,
      before: project,
      action: "delete",
    });
    // Refresh org-scoped keys' baked projectIds now that a project is gone.
    await this.apiAuthService.invalidateCachedOrgApiKeys(params.organizationId);
    // Soft-delete is the billing-relevant moment: the customer stops being
    // billable now, not when the async hard-delete worker finishes.
    emitChbProjectEvent({
      type: "LANGFUSE_PROJECT_DELETED",
      orgId: params.organizationId,
      projectId: params.projectId,
    });
    await this.queueHardDelete(params);
  }

  private async softDeleteAndUnlinkGateway(params: DeleteProjectParams) {
    const { project, clearedGateway } = await this.prisma.$transaction(
      async (tx) => {
        const clearedGateway = await new GatewayConfigService(
          tx,
        ).clearIngestionProject(params);
        // Decided on the cleared row, so a project selected as the ingestion
        // project while this delete runs still requires the permission.
        if (clearedGateway && !params.canManageGateway) {
          throw new ForbiddenError(
            "Deleting the AI Gateway ingestion project requires the gateway:manage permission.",
          );
        }
        await tx.apiKey.deleteMany({
          where: { projectId: params.projectId, scope: "PROJECT" },
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

  private async queueHardDelete(params: DeleteProjectParams) {
    const projectDeleteQueue = ProjectDeleteQueue.getInstance();
    if (!projectDeleteQueue) {
      throw new InternalServerError(
        "ProjectDeleteQueue is not available. Please try again later.",
      );
    }
    await projectDeleteQueue.add(QueueJobs.ProjectDelete, {
      timestamp: new Date(),
      id: randomUUID(),
      payload: { projectId: params.projectId, orgId: params.organizationId },
      name: QueueJobs.ProjectDelete,
    });
  }
}
