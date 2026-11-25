import type { PrismaClient } from "@langfuse/shared/src/db";

export class GatewayGuardrailRepository {
  constructor(private readonly prisma: PrismaClient) {}

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
}
