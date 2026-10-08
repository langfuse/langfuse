import { prisma, type LlmApiKeys, type Prisma } from "@langfuse/shared/src/db";
import { DECISION_MODEL_ADAPTERS } from "@langfuse/shared/src/server";

export type LlmConnectionOwner =
  | {
      type: "project";
      projectId: string;
      organizationId: string;
    }
  | {
      type: "organization";
      organizationId: string;
    };

type PrismaClient = typeof prisma | Prisma.TransactionClient;

const ownerWhere = (owner: LlmConnectionOwner): Prisma.LlmApiKeysWhereInput =>
  owner.type === "project"
    ? { projectId: owner.projectId }
    : { organizationId: owner.organizationId };

export class LlmConnectionRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  withDb(db: PrismaClient): LlmConnectionRepository {
    return new LlmConnectionRepository(db);
  }

  findById(params: {
    owner: LlmConnectionOwner;
    id: string;
  }): Promise<LlmApiKeys | null> {
    return this.db.llmApiKeys.findFirst({
      where: {
        id: params.id,
        ...ownerWhere(params.owner),
      },
    });
  }

  findByProvider(params: {
    owner: LlmConnectionOwner;
    provider: string;
  }): Promise<LlmApiKeys | null> {
    return this.db.llmApiKeys.findFirst({
      where: {
        provider: params.provider,
        ...ownerWhere(params.owner),
      },
    });
  }

  list(params: {
    owner: LlmConnectionOwner;
    includeDecisionModels: boolean;
    limit?: number;
    offset?: number;
  }): Promise<LlmApiKeys[]> {
    return this.db.llmApiKeys.findMany({
      where: {
        ...ownerWhere(params.owner),
        ...(params.includeDecisionModels
          ? {}
          : { adapter: { notIn: [...DECISION_MODEL_ADAPTERS] } }),
      },
      orderBy: { createdAt: "desc" },
      take: params.limit,
      skip: params.offset,
    });
  }

  count(owner: LlmConnectionOwner): Promise<number> {
    return this.db.llmApiKeys.count({ where: ownerWhere(owner) });
  }

  async listOrganizationConnectionsForProject(params: {
    projectId: string;
    organizationId: string;
    includeDecisionModels: boolean;
  }): Promise<{
    connections: LlmApiKeys[];
    overriddenProviders: Set<string>;
  }> {
    const [connections, projectConnections] = await Promise.all([
      this.db.llmApiKeys.findMany({
        where: {
          organizationId: params.organizationId,
          ...(params.includeDecisionModels
            ? {}
            : { adapter: { notIn: [...DECISION_MODEL_ADAPTERS] } }),
        },
        orderBy: { createdAt: "desc" },
      }),
      this.db.llmApiKeys.findMany({
        where: { projectId: params.projectId },
        select: { provider: true },
      }),
    ]);

    return {
      connections,
      overriddenProviders: new Set(
        projectConnections.map((connection) => connection.provider),
      ),
    };
  }

  create(params: {
    owner: LlmConnectionOwner;
    data: Omit<
      Prisma.LlmApiKeysUncheckedCreateInput,
      "projectId" | "organizationId"
    >;
  }): Promise<LlmApiKeys> {
    return this.db.llmApiKeys.create({
      data: {
        ...params.data,
        ...(params.owner.type === "project"
          ? { projectId: params.owner.projectId }
          : { organizationId: params.owner.organizationId }),
      },
    });
  }

  update(params: {
    owner: LlmConnectionOwner;
    id: string;
    data: Prisma.LlmApiKeysUpdateInput;
  }): Promise<LlmApiKeys> {
    return this.db.llmApiKeys.update({
      where:
        params.owner.type === "project"
          ? { id: params.id, projectId: params.owner.projectId }
          : { id: params.id, organizationId: params.owner.organizationId },
      data: params.data,
    });
  }

  delete(params: {
    owner: LlmConnectionOwner;
    id: string;
  }): Promise<LlmApiKeys> {
    return this.db.llmApiKeys.delete({
      where:
        params.owner.type === "project"
          ? { id: params.id, projectId: params.owner.projectId }
          : { id: params.id, organizationId: params.owner.organizationId },
    });
  }

  async listProjectsUsingOrganizationConnection(params: {
    organizationId: string;
    provider: string;
  }): Promise<string[]> {
    const projects = await this.db.project.findMany({
      where: {
        orgId: params.organizationId,
        deletedAt: null,
        llmApiKeys: {
          none: {
            provider: params.provider,
          },
        },
      },
      select: { id: true },
    });

    return projects.map((project) => project.id);
  }
}
