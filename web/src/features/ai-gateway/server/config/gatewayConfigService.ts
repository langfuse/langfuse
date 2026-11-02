import { InvalidRequestError } from "@langfuse/shared";
import type {
  GatewayIngestionMode,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/server";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { invalidateGatewayResolveCacheForOrganization } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { isGatewayIngestionConfigured } from "@/src/features/ai-gateway/fns/isGatewayIngestionConfigured";
import {
  getEffectiveGatewayIngestionMode,
  isGatewayIngestionModeAvailable,
} from "@/src/features/ai-gateway/fns/gatewayIngestionModePolicy";
import { GatewayConfigRepository } from "./gatewayConfigRepository";

export class GatewayConfigService {
  private readonly repository: GatewayConfigRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new GatewayConfigRepository(prisma);
  }

  async getConfig(organizationId: string) {
    const config = await this.repository.getConfig(organizationId);
    return (
      config && {
        ...config,
        ingestionMode: getEffectiveGatewayIngestionMode(config.ingestionMode),
      }
    );
  }

  async getSetupStatus(organizationId: string) {
    const config = await this.getConfig(organizationId);
    const project = config?.defaultIngestionProject;
    return {
      isConfigured: isGatewayIngestionConfigured({
        ingestionMode: config?.ingestionMode ?? "USAGE",
        hasActiveIngestionProject:
          !!project && !project.deletedAt && project.orgId === organizationId,
      }),
    };
  }

  async updateConfig(params: {
    organizationId: string;
    defaultIngestionProjectId: string | null;
    ingestionMode: GatewayIngestionMode;
    session: OrgAuthedContext["session"];
  }) {
    if (!isGatewayIngestionModeAvailable(params.ingestionMode)) {
      throw new InvalidRequestError(
        "Ingestion mode NONE is not available on Langfuse Cloud",
      );
    }
    if (
      !isGatewayIngestionConfigured({
        ingestionMode: params.ingestionMode,
        hasActiveIngestionProject: !!params.defaultIngestionProjectId,
      })
    ) {
      throw new InvalidRequestError(
        "A default ingestion project is required unless ingestion mode is NONE",
      );
    }

    const before = await this.repository.getConfig(params.organizationId);

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

    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayConfig",
        resourceId: params.organizationId,
        action: before ? "update" : "create",
        before,
        after: config,
      },
      this.prisma,
    );
    return config;
  }
}
