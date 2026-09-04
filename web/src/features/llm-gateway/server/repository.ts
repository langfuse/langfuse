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

  async createIngestionProjectAndUpsertConfig(params: {
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
        throw new Error("A project with this name already exists");
      }

      const project = await tx.project.create({
        data: {
          orgId: params.organizationId,
          name: params.projectName,
        },
      });
      let membershipCursor: string | undefined;
      do {
        const memberships = await tx.organizationMembership.findMany({
          where: { orgId: params.organizationId },
          select: { id: true, userId: true },
          orderBy: { id: "asc" },
          take: 100,
          ...(membershipCursor
            ? { cursor: { id: membershipCursor }, skip: 1 }
            : undefined),
        });
        await tx.projectMembership.createMany({
          data: memberships.map((membership) => ({
            projectId: project.id,
            userId: membership.userId,
            orgMembershipId: membership.id,
            role:
              membership.userId === params.createdByUserId ? "OWNER" : "NONE",
          })),
        });
        membershipCursor =
          memberships.length === 100 ? memberships.at(-1)?.id : undefined;
      } while (membershipCursor);
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

  async listConnections(params: {
    organizationId: string;
    cursor?: string;
    limit: number;
    status?: GatewayConnectionStatus;
  }) {
    const rows = await this.prisma.gatewayAiConnection.findMany({
      where: {
        organizationId: params.organizationId,
        status: params.status,
      },
      select: safeConnectionSelect,
      orderBy: [{ routingPriority: "asc" }, { id: "asc" }],
      take: params.limit + 1,
      ...(params.cursor
        ? { cursor: { id: params.cursor }, skip: 1 }
        : undefined),
    });
    const hasMore = rows.length > params.limit;
    const data = hasMore ? rows.slice(0, params.limit) : rows;
    return {
      data,
      nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null,
    };
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.organizationId}))`;
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

  async listGatewayApiKeys(params: {
    organizationId: string;
    cursor?: string;
    limit: number;
  }) {
    const rows = await this.prisma.gatewayApiKeyAssociation.findMany({
      where: {
        apiKey: {
          orgId: params.organizationId,
          scope: "ORGANIZATION",
          isGatewayKey: true,
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
      orderBy: [{ apiKey: { createdAt: "asc" } }, { apiKeyId: "asc" }],
      take: params.limit + 1,
      ...(params.cursor
        ? { cursor: { apiKeyId: params.cursor }, skip: 1 }
        : undefined),
    });
    const hasMore = rows.length > params.limit;
    const data = hasMore ? rows.slice(0, params.limit) : rows;
    return {
      data,
      nextCursor: hasMore ? (data.at(-1)?.apiKey.id ?? null) : null,
    };
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
          isGatewayKey: true,
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
