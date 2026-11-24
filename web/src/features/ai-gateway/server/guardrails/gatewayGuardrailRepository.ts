import type {
  GatewayGuardrailAction,
  Prisma,
  PrismaClient,
  Role,
} from "@langfuse/shared/src/db";
import { escapeSqlLikePattern } from "@langfuse/shared/src/server";

import {
  gatewayApiKeySearch,
  gatewayApiKeyWhere,
} from "@/src/features/ai-gateway/server/apiKey/gatewayApiKeyRepository";
import type {
  GatewayGuardrailAssignmentInput,
  GatewayGuardrailPreset,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";

const GUARDRAIL_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  type: true,
  action: true,
  config: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  assignments: {
    select: {
      id: true,
      scope: true,
      apiKeyId: true,
      userId: true,
      apiKey: {
        select: {
          id: true,
          note: true,
          displaySecretKey: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [
      { scope: "asc" as const },
      { createdAt: "asc" as const },
    ] satisfies Prisma.GatewayGuardrailAssignmentOrderByWithRelationInput[],
  },
} satisfies Prisma.GatewayGuardrailSelect;

export type GatewayGuardrailRecord = Prisma.GatewayGuardrailGetPayload<{
  select: typeof GUARDRAIL_SELECT;
}>;

export class GatewayGuardrailRepository {
  constructor(
    private readonly prisma: PrismaClient | Prisma.TransactionClient,
  ) {}

  /**
   * The organization's guardrails assigned to the whole organization, to the
   * key, or to the key's user, each once. One query; the assignment lookups
   * use the per-scope unique indexes on `guardrail_id`.
   */
  findAssigned(params: {
    organizationId: string;
    apiKeyId: string;
    userId: string | null;
  }) {
    return this.prisma.gatewayGuardrail.findMany({
      where: {
        organizationId: params.organizationId,
        assignments: {
          some: {
            OR: [
              { scope: "ORGANIZATION" },
              { apiKeyId: params.apiKeyId },
              ...(params.userId ? [{ userId: params.userId }] : []),
            ],
          },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, type: true, action: true, config: true },
    });
  }

  async listPage(params: {
    organizationId: string;
    searchQuery?: string;
    page: number;
    limit: number;
  }) {
    const where = toGuardrailWhere(params);
    const [rows, totalCount] = await Promise.all([
      this.prisma.gatewayGuardrail.findMany({
        where,
        select: GUARDRAIL_SELECT,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: params.page * params.limit,
        take: params.limit,
      }),
      this.prisma.gatewayGuardrail.count({ where }),
    ]);
    return { rows, totalCount };
  }

  listMatching(params: { organizationId: string; searchQuery?: string }) {
    return this.prisma.gatewayGuardrail.findMany({
      where: toGuardrailWhere(params),
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  findById(params: { organizationId: string; id: string }) {
    return this.prisma.gatewayGuardrail.findFirst({
      where: { organizationId: params.organizationId, id: params.id },
      select: GUARDRAIL_SELECT,
    });
  }

  findByIds(params: { organizationId: string; ids: string[] }) {
    if (params.ids.length === 0) return Promise.resolve([]);
    return this.prisma.gatewayGuardrail.findMany({
      where: {
        organizationId: params.organizationId,
        id: { in: params.ids },
      },
      select: GUARDRAIL_SELECT,
    });
  }

  create(params: {
    organizationId: string;
    name: string;
    action: GatewayGuardrailAction;
    presets: GatewayGuardrailPreset[];
    assignments: GatewayGuardrailAssignmentInput[];
    createdBy: string;
  }) {
    return this.prisma.gatewayGuardrail.create({
      data: {
        organizationId: params.organizationId,
        name: params.name,
        type: "REGEX",
        action: params.action,
        config: { presets: params.presets },
        createdBy: params.createdBy,
        assignments: {
          create: params.assignments.map((assignment) =>
            toAssignmentCreateData(params.organizationId, assignment),
          ),
        },
      },
      select: GUARDRAIL_SELECT,
    });
  }

  async update(params: {
    organizationId: string;
    id: string;
    name: string;
    action: GatewayGuardrailAction;
    presets: GatewayGuardrailPreset[];
    assignments: GatewayGuardrailAssignmentInput[];
  }) {
    await this.prisma.gatewayGuardrailAssignment.deleteMany({
      where: { guardrailId: params.id, organizationId: params.organizationId },
    });
    return this.prisma.gatewayGuardrail.update({
      where: { id: params.id },
      data: {
        name: params.name,
        action: params.action,
        config: { presets: params.presets },
        assignments: {
          create: params.assignments.map((assignment) =>
            toAssignmentCreateData(params.organizationId, assignment),
          ),
        },
      },
      select: GUARDRAIL_SELECT,
    });
  }

  deleteMany(params: { organizationId: string; ids: string[] }) {
    if (params.ids.length === 0) return Promise.resolve({ count: 0 });
    return this.prisma.gatewayGuardrail.deleteMany({
      where: {
        organizationId: params.organizationId,
        id: { in: params.ids },
      },
    });
  }

  async findValidTargetIds(params: {
    organizationId: string;
    apiKeyIds: string[];
    userIds: string[];
  }) {
    const [apiKeys, memberships] = await Promise.all([
      params.apiKeyIds.length > 0
        ? this.prisma.apiKey.findMany({
            where: {
              ...gatewayApiKeyWhere({ organizationId: params.organizationId }),
              gatewayAssociation: { isNot: null },
              id: { in: params.apiKeyIds },
            },
            select: { id: true },
          })
        : Promise.resolve([]),
      params.userIds.length > 0
        ? this.prisma.organizationMembership.findMany({
            where: {
              orgId: params.organizationId,
              userId: { in: params.userIds },
            },
            select: { userId: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      apiKeyIds: new Set(apiKeys.map(({ id }) => id)),
      userIds: new Set(memberships.map(({ userId }) => userId)),
    };
  }

  async searchTargets(params: {
    organizationId: string;
    memberRoles: Role[];
    searchQuery?: string;
    limit: number;
  }) {
    const search = params.searchQuery
      ? ({
          contains: escapeSqlLikePattern(params.searchQuery),
          mode: "insensitive",
        } as const)
      : undefined;

    const [memberships, apiKeys] = await Promise.all([
      this.prisma.organizationMembership.findMany({
        where: {
          orgId: params.organizationId,
          role: { in: params.memberRoles },
          user: {
            email: { not: null },
            ...(search && { OR: [{ name: search }, { email: search }] }),
          },
        },
        select: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: [
          { user: { name: { sort: "asc", nulls: "last" } } },
          { userId: "asc" },
        ],
        take: params.limit,
      }),
      this.prisma.apiKey.findMany({
        where: {
          ...gatewayApiKeyWhere({ organizationId: params.organizationId }),
          gatewayAssociation: { isNot: null },
          ...(params.searchQuery && gatewayApiKeySearch(params.searchQuery)),
        },
        select: {
          id: true,
          note: true,
          displaySecretKey: true,
          user: {
            select: { name: true, email: true },
          },
        },
        orderBy: [{ note: { sort: "asc", nulls: "last" } }, { id: "asc" }],
        take: params.limit,
      }),
    ]);

    return {
      users: memberships.map(({ user }) => ({
        id: user.id,
        name: user.name,
        email: user.email,
      })),
      apiKeys: apiKeys.map((apiKey) => ({
        id: apiKey.id,
        name: apiKey.note ?? apiKey.displaySecretKey,
        ownerLabel: apiKey.user?.name ?? apiKey.user?.email ?? null,
      })),
    };
  }
}

function toGuardrailWhere(params: {
  organizationId: string;
  searchQuery?: string;
}): Prisma.GatewayGuardrailWhereInput {
  return {
    organizationId: params.organizationId,
    ...(params.searchQuery
      ? {
          name: {
            contains: escapeSqlLikePattern(params.searchQuery),
            mode: "insensitive",
          },
        }
      : {}),
  };
}

function toAssignmentCreateData(
  organizationId: string,
  assignment: GatewayGuardrailAssignmentInput,
) {
  switch (assignment.scope) {
    case "ORGANIZATION":
      return { organizationId, scope: "ORGANIZATION" as const };
    case "API_KEY":
      return {
        organizationId,
        scope: "API_KEY" as const,
        apiKeyId: assignment.apiKeyId,
      };
    case "USER":
      return {
        organizationId,
        scope: "USER" as const,
        userId: assignment.userId,
      };
  }
}
