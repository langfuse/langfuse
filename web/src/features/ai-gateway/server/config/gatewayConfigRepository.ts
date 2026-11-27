import type { Prisma, PrismaClient } from "@langfuse/shared/src/db";
import { getCapturingGatewayIngestionModes } from "@/src/features/ai-gateway/fns/gatewayIngestionModePolicy";

function writingToProject(params: {
  organizationId: string;
  projectId: string;
}) {
  return {
    organizationId: params.organizationId,
    defaultIngestionProjectId: params.projectId,
    // With ingestion NONE the project is only remembered, not written to.
    ingestionMode: { in: getCapturingGatewayIngestionModes() },
  };
}

export class GatewayConfigRepository {
  constructor(
    private readonly prisma: PrismaClient | Prisma.TransactionClient,
  ) {}

  getConfig(organizationId: string) {
    return this.prisma.gatewayConfig.findUnique({
      where: { organizationId },
      include: {
        defaultIngestionProject: {
          select: { id: true, orgId: true, deletedAt: true },
        },
      },
    });
  }

  getActiveOrganizationProject(params: {
    organizationId: string;
    projectId: string;
  }) {
    return this.prisma.project.findFirst({
      where: {
        id: params.projectId,
        orgId: params.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  getConfigWritingToProject(params: {
    organizationId: string;
    projectId: string;
  }) {
    return this.prisma.gatewayConfig.findFirst({
      where: writingToProject(params),
    });
  }

  /** Conditional so a concurrently selected replacement project is not cleared. */
  async clearIngestionProject(params: {
    organizationId: string;
    projectId: string;
  }) {
    const { count } = await this.prisma.gatewayConfig.updateMany({
      where: writingToProject(params),
      data: { defaultIngestionProjectId: null },
    });
    return count > 0;
  }
}
