import { z } from "zod/v4";
import { InvalidRequestError } from "@langfuse/shared";
import { Prisma, type PrismaClient } from "@langfuse/shared/src/db";
import type { OrgAuthedContext } from "@/src/server/api/trpc";

import { auditLog } from "@/src/features/audit-logs/server";
import { invalidateGatewayResolveCacheForOrganization } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { GatewayAliasNameSchema } from "@/src/features/ai-gateway/types/gatewayAlias";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

const MAX_TARGETS = 10;

const aliasTargetSchema = z.object({
  connectionId: z.string().min(1),
  providerModel: z.string().trim().min(1).max(256),
});

export const upsertAliasInputSchema = z.object({
  organizationId: z.string(),
  id: z.string().optional(),
  name: GatewayAliasNameSchema,
  status: z.enum(["ENABLED", "DISABLED"]).default("ENABLED"),
  targets: z.array(aliasTargetSchema).min(1).max(MAX_TARGETS),
});

export type UpsertAliasInput = z.infer<typeof upsertAliasInputSchema>;

/** Ordered upstream target of an alias; position is the fallback order. */
type GatewayAliasTargetDto = {
  id: string;
  connectionId: string;
  connectionName: string;
  connectionProvider: GatewayProvider;
  connectionStatus: "ENABLED" | "ERROR" | "DISABLED";
  providerModel: string;
  position: number;
};

export type GatewayAliasDto = {
  id: string;
  name: string;
  status: "ENABLED" | "DISABLED";
  updatedAt: Date;
  targets: GatewayAliasTargetDto[];
};

/** Audited alias fields. Targets make a re-pointed alias traceable;
 * credentials are never selected. */
const auditedAliasSelect = {
  id: true,
  name: true,
  status: true,
  targets: {
    orderBy: [{ position: "asc" }],
    select: { connectionId: true, providerModel: true, position: true },
  },
} satisfies Prisma.GatewayAiAliasSelect;

type AuditedAlias = Prisma.GatewayAiAliasGetPayload<{
  select: typeof auditedAliasSelect;
}>;

function toAuditRecord(alias: AuditedAlias) {
  return {
    name: alias.name,
    status: alias.status,
    targets: alias.targets,
  };
}

/** Maps a client-facing model name to ordered upstream targets. Resolve
 * picks the first target that can serve; the rest are the gateway's fallbacks. */
export class GatewayAliasService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(organizationId: string): Promise<GatewayAliasDto[]> {
    const aliases = await this.prisma.gatewayAiAlias.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        targets: {
          orderBy: [{ position: "asc" }],
          select: {
            id: true,
            connectionId: true,
            providerModel: true,
            position: true,
            connection: {
              select: { name: true, provider: true, status: true },
            },
          },
        },
      },
    });
    return aliases.map((alias) => ({
      id: alias.id,
      name: alias.name,
      status: alias.status,
      updatedAt: alias.updatedAt,
      targets: alias.targets.map((target) => ({
        id: target.id,
        connectionId: target.connectionId,
        connectionName: target.connection.name,
        connectionProvider: target.connection.provider,
        connectionStatus: target.connection.status,
        providerModel: target.providerModel,
        position: target.position,
      })),
    }));
  }

  /** Creates an alias, or replaces the whole target list when `id` is given. */
  async upsert(
    params: UpsertAliasInput & { session: OrgAuthedContext["session"] },
  ) {
    const { organizationId, session } = params;

    const connectionIds = [
      ...new Set(params.targets.map((target) => target.connectionId)),
    ];
    const connections = await this.prisma.gatewayAiConnection.findMany({
      where: { organizationId, id: { in: connectionIds } },
      select: { id: true },
    });
    const unknownConnectionIds = connectionIds.filter(
      (connectionId) =>
        !connections.some((connection) => connection.id === connectionId),
    );
    if (unknownConnectionIds.length > 0) {
      throw new InvalidRequestError(
        `Unknown connection: ${unknownConnectionIds[0]}`,
      );
    }

    let alias;
    try {
      alias = await this.prisma.$transaction(async (tx) => {
        const existing = params.id
          ? await tx.gatewayAiAlias.findFirst({
              where: { organizationId, id: params.id },
              select: auditedAliasSelect,
            })
          : null;
        if (params.id && !existing) {
          throw new InvalidRequestError("Alias not found");
        }

        const nameConflict = await tx.gatewayAiAlias.findFirst({
          where: {
            organizationId,
            name: params.name,
            ...(existing ? { id: { not: existing.id } } : {}),
          },
          select: { id: true },
        });
        if (nameConflict) {
          throw new InvalidRequestError(
            `Alias name "${params.name}" already exists`,
          );
        }

        const stored = existing
          ? await tx.gatewayAiAlias.update({
              where: { id: existing.id },
              data: {
                name: params.name,
                status: params.status,
                targets: {
                  deleteMany: {},
                  create: params.targets.map((target, index) => ({
                    connectionId: target.connectionId,
                    providerModel: target.providerModel,
                    position: index,
                  })),
                },
              },
              select: auditedAliasSelect,
            })
          : await tx.gatewayAiAlias.create({
              data: {
                organizationId,
                name: params.name,
                status: params.status,
                targets: {
                  create: params.targets.map((target, index) => ({
                    connectionId: target.connectionId,
                    providerModel: target.providerModel,
                    position: index,
                  })),
                },
              },
              select: auditedAliasSelect,
            });

        return { stored, existing };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new InvalidRequestError(
          `Alias name "${params.name}" already exists`,
        );
      }
      throw error;
    }

    await invalidateGatewayResolveCacheForOrganization(organizationId);
    await auditLog(
      {
        session,
        resourceType: "gatewayAiAlias",
        resourceId: alias.stored.id,
        action: alias.existing ? "update" : "create",
        ...(alias.existing ? { before: toAuditRecord(alias.existing) } : {}),
        after: toAuditRecord(alias.stored),
      },
      this.prisma,
    );
    return this.get(organizationId, alias.stored.id);
  }

  async delete(params: {
    organizationId: string;
    id: string;
    session: OrgAuthedContext["session"];
  }) {
    const existing = await this.prisma.gatewayAiAlias.findFirst({
      where: { organizationId: params.organizationId, id: params.id },
      select: auditedAliasSelect,
    });
    if (!existing) {
      throw new InvalidRequestError("Alias not found");
    }
    await this.prisma.gatewayAiAlias.delete({ where: { id: existing.id } });
    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayAiAlias",
        resourceId: existing.id,
        action: "delete",
        before: toAuditRecord(existing),
      },
      this.prisma,
    );
  }

  private async get(organizationId: string, id: string) {
    const aliases = await this.list(organizationId);
    const alias = aliases.find((candidate) => candidate.id === id);
    if (!alias) {
      throw new InvalidRequestError("Alias not found");
    }
    return alias;
  }
}
