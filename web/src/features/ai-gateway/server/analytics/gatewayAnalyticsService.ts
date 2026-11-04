import { InvalidRequestError, type FilterCondition } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { validateQuery, type QueryType } from "@langfuse/shared/query";
import { executeQuery } from "@langfuse/shared/query/server";

import { env } from "@/src/env.mjs";
import { GATEWAY_TRAFFIC_FILTER } from "@/src/features/ai-gateway/constants/gatewayTrafficFilter";
import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";

/** Gateway analytics run on the observations the gateway records into its ingestion project. */
export class GatewayAnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * The project comes from the gateway config, never from the caller. With
   * `ownerUserId`, only usage of keys bound to that user is counted; the
   * filter is ANDed with the query's own filters, so they can only narrow it.
   */
  async executeQuery(params: {
    organizationId: string;
    query: QueryType;
    ownerUserId?: string;
  }) {
    // v2 reads the events tables, which a legacy deployment does not write.
    if (env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy") {
      throw new InvalidRequestError(
        "Gateway analytics are not available on this deployment",
      );
    }
    if (params.query.view !== "observations") {
      throw new InvalidRequestError(
        "Gateway analytics only query observations",
      );
    }
    const projectId = await this.getIngestionProjectId(params.organizationId);

    const query: QueryType = {
      ...params.query,
      filters: [
        GATEWAY_TRAFFIC_FILTER,
        ...(params.ownerUserId === undefined
          ? []
          : [keyOwnerFilter(params.ownerUserId)]),
        ...params.query.filters,
      ],
    };
    const validation = validateQuery(query, "v2");
    if (!validation.valid) throw new InvalidRequestError(validation.reason);

    return executeQuery(projectId, query, "v2", true);
  }

  private async getIngestionProjectId(organizationId: string) {
    const config = await new GatewayConfigService(this.prisma).getConfig(
      organizationId,
    );
    const project = config?.defaultIngestionProject;
    if (
      !config ||
      config.ingestionMode === "NONE" ||
      !project ||
      project.deletedAt ||
      project.orgId !== organizationId
    ) {
      throw new InvalidRequestError("Gateway requests are not recorded");
    }
    return project.id;
  }
}

function keyOwnerFilter(ownerUserId: string): FilterCondition {
  return {
    column: "aiGatewayKeyOwnerUserId",
    operator: "any of",
    value: [ownerUserId],
    type: "stringOptions",
  };
}
