import { InvalidRequestError } from "@langfuse/shared";
import type {
  GatewayInstrumentationMode,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { invalidateCachedOrgApiKeys } from "@langfuse/shared/src/server";

import { auditLog } from "@/src/features/audit-logs/server";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
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
      result = {
        config: await this.repository.upsertConfig({
          organizationId: params.organizationId,
          defaultIngestionProjectId: params.defaultIngestionProjectId,
          instrumentationMode: params.instrumentationMode,
        }),
        project: null,
      };
    }

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
