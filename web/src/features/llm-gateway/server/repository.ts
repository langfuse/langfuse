import type {
  GatewayConnectionStatus,
  GatewayInstrumentationMode,
  GatewayProvider,
  Prisma,
  PrismaClient,
} from "@langfuse/shared/src/db";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const safeConnectionSelect = {
  id: true,
  organizationId: true,
  name: true,
  provider: true,
  displaySecret: true,
  createdById: true,
  routingPriority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GatewayAiConnectionSelect;

export class GatewayRepository {
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

  async upsertConfig(params: {
    organizationId: string;
    defaultIngestionProjectId: string | null;
    instrumentationMode: GatewayInstrumentationMode;
  }) {
    return this.prisma.gatewayConfig.upsert({
      where: { organizationId: params.organizationId },
      create: params,
      update: {
        defaultIngestionProjectId: params.defaultIngestionProjectId,
        instrumentationMode: params.instrumentationMode,
      },
    });
  }

  listConnections(organizationId: string) {
    return this.prisma.gatewayAiConnection.findMany({
      where: { organizationId },
      select: safeConnectionSelect,
      orderBy: { routingPriority: "asc" },
    });
  }

  getSafeConnection(params: { organizationId: string; id: string }) {
    return this.prisma.gatewayAiConnection.findFirst({
      where: params,
      select: safeConnectionSelect,
    });
  }

  getConnectionWithCredential(params: { organizationId: string; id: string }) {
    return this.prisma.gatewayAiConnection.findFirst({
      where: params,
      select: {
        ...safeConnectionSelect,
        encryptedCredential: true,
      },
    });
  }

  async createConnection(params: {
    organizationId: string;
    name: string;
    provider: GatewayProvider;
    encryptedCredential: string;
    displaySecret: string;
    createdById: string | null;
    status: GatewayConnectionStatus;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.gatewayAiConnection.aggregate({
        where: { organizationId: params.organizationId },
        _max: { routingPriority: true },
      });
      return tx.gatewayAiConnection.create({
        data: {
          ...params,
          routingPriority: (aggregate._max.routingPriority ?? -1) + 1,
        },
        select: safeConnectionSelect,
      });
    });
  }

  updateConnection(params: {
    organizationId: string;
    id: string;
    name?: string;
    encryptedCredential?: string;
    displaySecret?: string;
    status?: GatewayConnectionStatus;
  }) {
    const { organizationId, id, ...data } = params;
    return this.prisma.gatewayAiConnection.update({
      where: { id, organizationId },
      data,
      select: safeConnectionSelect,
    });
  }

  deleteConnection(params: { organizationId: string; id: string }) {
    return this.prisma.gatewayAiConnection.delete({
      where: params,
      select: safeConnectionSelect,
    });
  }

  async reorderConnections(params: {
    organizationId: string;
    connectionIds: string[];
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of params.connectionIds.entries()) {
        await this.updatePriority(tx, {
          organizationId: params.organizationId,
          id,
          routingPriority: -(index + 1),
        });
      }
      for (const [index, id] of params.connectionIds.entries()) {
        await this.updatePriority(tx, {
          organizationId: params.organizationId,
          id,
          routingPriority: index,
        });
      }
    });
  }

  private updatePriority(
    tx: DatabaseClient,
    params: {
      organizationId: string;
      id: string;
      routingPriority: number;
    },
  ) {
    return tx.gatewayAiConnection.update({
      where: { id: params.id, organizationId: params.organizationId },
      data: { routingPriority: params.routingPriority },
    });
  }

  updateConnectionStatus(params: {
    organizationId: string;
    id: string;
    status: GatewayConnectionStatus;
  }) {
    return this.prisma.gatewayAiConnection.update({
      where: { id: params.id, organizationId: params.organizationId },
      data: { status: params.status },
      select: safeConnectionSelect,
    });
  }

  async listGatewayApiKeys(organizationId: string) {
    return this.prisma.gatewayApiKeyAssociation.findMany({
      where: {
        apiKey: {
          orgId: organizationId,
          scope: "ORGANIZATION",
        },
      },
      select: {
        metadata: true,
        apiKey: {
          select: {
            id: true,
            publicKey: true,
            displaySecretKey: true,
            note: true,
            createdAt: true,
            expiresAt: true,
            lastUsedAt: true,
            createdByUserId: true,
          },
        },
      },
      orderBy: { apiKey: { createdAt: "asc" } },
    });
  }

  getGatewayApiKey(params: { organizationId: string; apiKeyId: string }) {
    return this.prisma.gatewayApiKeyAssociation.findFirst({
      where: {
        apiKeyId: params.apiKeyId,
        apiKey: {
          orgId: params.organizationId,
          scope: "ORGANIZATION",
        },
      },
      select: { apiKeyId: true },
    });
  }

  resolveGatewayContext(params: { fastHashedSecretKey: string }) {
    const now = new Date();
    return this.prisma.gatewayApiKeyAssociation.findFirst({
      where: {
        apiKey: {
          fastHashedSecretKey: params.fastHashedSecretKey,
          scope: "ORGANIZATION",
          orgId: { not: null },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
      select: {
        apiKeyId: true,
        apiKey: { select: { orgId: true } },
        metadata: true,
      },
    });
  }

  selectConnectionWithCredential(params: {
    organizationId: string;
    providers: GatewayProvider[];
  }) {
    return this.prisma.gatewayAiConnection.findFirst({
      where: {
        organizationId: params.organizationId,
        provider: { in: params.providers },
        status: "ENABLED",
      },
      orderBy: { routingPriority: "asc" },
      select: {
        id: true,
        provider: true,
        encryptedCredential: true,
      },
    });
  }
}
