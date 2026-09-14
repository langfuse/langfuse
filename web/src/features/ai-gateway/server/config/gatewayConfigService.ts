import { InvalidRequestError } from "@langfuse/shared";
import type {
  GatewayIngestionMode,
  PrismaClient,
} from "@langfuse/shared/src/db";
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
    ingestionMode: GatewayIngestionMode;
    session: OrgAuthedContext["session"];
  }) {
    const before = await this.getConfig(params.organizationId);

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
