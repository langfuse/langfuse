import { InvalidRequestError } from "@langfuse/shared";
import type {
  GatewayIngestionMode,
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
    ingestionMode: GatewayIngestionMode;
    session: OrgAuthedContext["session"];
  }) {
    const before = await this.getConfig(params.organizationId);
    let result;
    if (params.createProjectName) {
      result = await this.createIngestionProjectAndUpsertConfig({
        organizationId: params.organizationId,
        projectName: params.createProjectName,
        ingestionMode: params.ingestionMode,
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
        ingestionMode: params.ingestionMode,
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

  private async upsertConfigForExistingProject(params: {
    organizationId: string;
    defaultIngestionProjectId: string | null;
    ingestionMode: GatewayIngestionMode;
  }) {
    const config = await this.prisma.gatewayConfig.upsert({
      where: { organizationId: params.organizationId },
      create: {
        organizationId: params.organizationId,
        defaultIngestionProjectId: params.defaultIngestionProjectId,
        ingestionMode: params.ingestionMode,
      },
      update: {
        defaultIngestionProjectId: params.defaultIngestionProjectId,
        ingestionMode: params.ingestionMode,
      },
    });
    return { config, project: null };
  }

  private createIngestionProjectAndUpsertConfig(params: {
    organizationId: string;
    projectName: string;
    ingestionMode: GatewayIngestionMode;
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
      const config = await tx.gatewayConfig.upsert({
        where: { organizationId: params.organizationId },
        create: {
          organizationId: params.organizationId,
          defaultIngestionProjectId: project.id,
          ingestionMode: params.ingestionMode,
        },
        update: {
          defaultIngestionProjectId: project.id,
          ingestionMode: params.ingestionMode,
        },
      });
      return { config, project };
    });
  }
}
