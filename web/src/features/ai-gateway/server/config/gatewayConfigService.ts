import { InvalidRequestError } from "@langfuse/shared";
import type {
  GatewayInstrumentationMode,
  Prisma,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { invalidateCachedOrgApiKeys } from "@langfuse/shared/src/server";

import { auditLog } from "@/src/features/audit-logs/server";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { invalidateGatewayResolveCacheForOrganization } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { GatewayConfigRepository } from "./gatewayConfigRepository";

export class GatewayConfigService {
  private readonly repository: GatewayConfigRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new GatewayConfigRepository(prisma);
  }

  getConfig(organizationId: string) {
    return this.repository.getConfig(organizationId);
  }

  async updateConfig(params: {
    organizationId: string;
    defaultIngestionProjectId: string | null;
    createProjectName?: string;
    instrumentationMode: GatewayInstrumentationMode;
    session: OrgAuthedContext["session"];
  }) {
    const before = await this.getConfig(params.organizationId);
    let result;
    if (params.createProjectName) {
      result = await this.createIngestionProjectAndUpsertConfig({
        organizationId: params.organizationId,
        projectName: params.createProjectName,
        createdByUserId: params.session.user.id,
        instrumentationMode: params.instrumentationMode,
      });
    } else {
      if (params.defaultIngestionProjectId) {
        const project = await this.repository.getActiveOrganizationProject({
          organizationId: params.organizationId,
          projectId: params.defaultIngestionProjectId,
        });
        if (!project) {
          throw new InvalidRequestError(
            "Default ingestion project must be an active project in the organization",
          );
        }
      }
      result = await this.upsertConfigForExistingProject({
        organizationId: params.organizationId,
        defaultIngestionProjectId: params.defaultIngestionProjectId,
        instrumentationMode: params.instrumentationMode,
      });
    }

    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayConfig",
        resourceId: params.organizationId,
        action: before ? "update" : "create",
        before,
        after: result.config,
      },
      this.prisma,
    );
    if (result.project) {
      await auditLog(
        {
          session: params.session,
          resourceType: "project",
          resourceId: result.project.id,
          action: "create",
          after: result.project,
        },
        this.prisma,
      );
      await invalidateCachedOrgApiKeys(params.organizationId);
    }
    return result;
  }

  /**
   * Points the gateway at a project that already exists.
   *
   * The ingestion project is excluded from organization-role inheritance (see
   * resolveProjectRole), so without this the setting would silently remove an
   * existing project from everyone who reached it through their organization
   * role. Current access is therefore written out as explicit memberships, and
   * only members who join later are kept out.
   */
  private upsertConfigForExistingProject(params: {
    organizationId: string;
    defaultIngestionProjectId: string | null;
    instrumentationMode: GatewayInstrumentationMode;
  }) {
    return this.prisma.$transaction(async (tx) => {
      if (params.defaultIngestionProjectId) {
        await this.preserveInheritedProjectAccess({
          tx,
          organizationId: params.organizationId,
          projectId: params.defaultIngestionProjectId,
        });
      }
      const config = await tx.gatewayConfig.upsert({
        where: { organizationId: params.organizationId },
        create: params,
        update: {
          defaultIngestionProjectId: params.defaultIngestionProjectId,
          instrumentationMode: params.instrumentationMode,
        },
      });
      return { config, project: null };
    });
  }

  private async preserveInheritedProjectAccess(params: {
    tx: Prisma.TransactionClient;
    organizationId: string;
    projectId: string;
  }) {
    let membershipCursor: string | undefined;
    do {
      const memberships = await params.tx.organizationMembership.findMany({
        where: { orgId: params.organizationId, role: { not: "NONE" } },
        select: { id: true, userId: true, role: true },
        orderBy: { id: "asc" },
        take: 100,
        ...(membershipCursor
          ? { cursor: { id: membershipCursor }, skip: 1 }
          : undefined),
      });
      await params.tx.projectMembership.createMany({
        data: memberships.map((membership) => ({
          projectId: params.projectId,
          userId: membership.userId,
          orgMembershipId: membership.id,
          role: membership.role,
        })),
        // Members with an explicit role on this project already keep it.
        skipDuplicates: true,
      });
      membershipCursor =
        memberships.length === 100 ? memberships.at(-1)?.id : undefined;
    } while (membershipCursor);
  }

  private createIngestionProjectAndUpsertConfig(params: {
    organizationId: string;
    projectName: string;
    createdByUserId: string;
    instrumentationMode: GatewayInstrumentationMode;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.project.findFirst({
        where: {
          orgId: params.organizationId,
          name: params.projectName,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existing) {
        const config = await tx.gatewayConfig.findUnique({
          where: { organizationId: params.organizationId },
        });
        if (config?.defaultIngestionProjectId === existing.id) {
          return { config, project: null };
        }
        throw new InvalidRequestError(
          "A project with this name already exists",
        );
      }

      const project = await tx.project.create({
        data: {
          orgId: params.organizationId,
          name: params.projectName,
        },
      });
      // The ingestion project is not accessible through organization-role
      // inheritance (see resolveProjectRole), so the creator needs an explicit
      // membership to keep managing it. Everyone else gains access only when an
      // admin grants them a project role.
      await tx.projectMembership.create({
        data: {
          projectId: project.id,
          userId: params.createdByUserId,
          orgMembershipId: (
            await tx.organizationMembership.findFirstOrThrow({
              where: {
                orgId: params.organizationId,
                userId: params.createdByUserId,
              },
              select: { id: true },
            })
          ).id,
          role: "OWNER",
        },
      });
      const config = await tx.gatewayConfig.upsert({
        where: { organizationId: params.organizationId },
        create: {
          organizationId: params.organizationId,
          defaultIngestionProjectId: project.id,
          instrumentationMode: params.instrumentationMode,
        },
        update: {
          defaultIngestionProjectId: project.id,
          instrumentationMode: params.instrumentationMode,
        },
      });
      return { config, project };
    });
  }
}
