import type { PrismaClient } from "@langfuse/shared/src/db";

export class GatewayConfigRepository {
  constructor(private readonly prisma: PrismaClient) {}

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
}
