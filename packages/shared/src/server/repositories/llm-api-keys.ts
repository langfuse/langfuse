import { type LlmApiKeys, type Prisma } from "@prisma/client";

import { prisma } from "../../db";

type PrismaClient = typeof prisma | Prisma.TransactionClient;

export type LlmApiKeyOwners = {
  organizationId: string;
  connections: LlmApiKeys[];
};

export class LlmApiKeyRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findByProjectAndOrganization(params: {
    projectId: string;
    provider?: string;
  }): Promise<LlmApiKeyOwners | null> {
    const project = await this.db.project.findUnique({
      where: {
        id: params.projectId,
        deletedAt: null,
      },
      select: {
        orgId: true,
      },
    });

    if (!project) {
      return null;
    }

    const connections = await this.db.llmApiKeys.findMany({
      where: {
        ...(params.provider ? { provider: params.provider } : {}),
        OR: [
          { projectId: params.projectId },
          { organizationId: project.orgId },
        ],
      },
    });

    return {
      organizationId: project.orgId,
      connections,
    };
  }
}
