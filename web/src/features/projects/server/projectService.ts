import { randomUUID } from "crypto";
import { ForbiddenError, InternalServerError } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  DefaultEvalModelService,
  ProjectDeleteQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { transferRoleAssignments } from "@langfuse/shared/rbac/server";
import { reconcileTopicsConnectionsForProject } from "@langfuse/shared/topics/server";
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

type TransferProjectParams = {
  /** The organization the project belongs to before the transfer. */
  organizationId: string;
  targetOrganizationId: string;
  projectId: string;
  actor: AuditLogActor;
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

  /**
   * transfer moves a project into another organization. The project keeps its
   * data and API keys, loses its memberships and user role assignments, and
   * rebinds its default eval model and topics connections to the destination
   * organization. Callers must check `projects:transfer_org` in both
   * organizations.
   */
  async transfer(params: TransferProjectParams) {
    const { organizationId, targetOrganizationId, projectId } = params;

    await auditLog({
      ...params.actor,
      resourceType: "project",
      resourceId: projectId,
      action: "transfer",
      before: { orgId: organizationId },
      after: { orgId: targetOrganizationId },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.projectMembership.deleteMany({ where: { projectId } });
      await tx.project.update({
        where: { id: projectId, orgId: organizationId },
        data: { orgId: targetOrganizationId },
      });
      // Move the project's api-key assignments to the destination org and
      // drop its user assignments, matching the membership wipe above.
      await transferRoleAssignments(tx, projectId, targetOrganizationId);
    });

    // API keys need to be deleted from cache. Otherwise, they will still be valid.
    // It has to be called after the db is done to prevent new API keys from being cached.
    await this.apiAuthService.invalidateCachedProjectApiKeys(projectId);

    // Both orgs' org-scoped keys bake a projectId set that just changed.
    await this.apiAuthService.invalidateCachedOrgApiKeys(organizationId);
    await this.apiAuthService.invalidateCachedOrgApiKeys(targetOrganizationId);

    // A transfer is a delete for the source org and a create for the
    // destination one. CHB's registry is keyed by (organizationId,
    // projectId), so emitting only one side leaves the source org billed for
    // usage it no longer owns, or the destination org unmetered. Each emit
    // no-ops unless that org is CHB-billed, so a Stripe-to-Stripe transfer
    // sends nothing.
    emitChbProjectEvent({
      type: "LANGFUSE_PROJECT_DELETED",
      orgId: organizationId,
      projectId,
    });
    emitChbProjectEvent({
      type: "LANGFUSE_PROJECT_CREATED",
      orgId: targetOrganizationId,
      projectId,
    });

    await Promise.all([
      DefaultEvalModelService.reconcileConnectionForProject(projectId),
      reconcileTopicsConnectionsForProject(projectId),
    ]);
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
