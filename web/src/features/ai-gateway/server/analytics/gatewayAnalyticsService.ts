import { TRPCError } from "@trpc/server";
import { InvalidRequestError, type FilterCondition } from "@langfuse/shared";
import { validateQuery, type QueryType } from "@langfuse/shared/query";
import { executeQuery } from "@langfuse/shared/query/server";

import { GATEWAY_TRAFFIC_FILTER } from "@/src/features/ai-gateway/constants/gatewayTrafficFilter";
import type { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";
import {
  getKeyOwnerFilter,
  type GatewayUsageScope,
} from "@/src/features/ai-gateway/server/gatewayUsageScope";

/** Gateway analytics run on the observations the gateway records into its ingestion project. */
export class GatewayAnalyticsService {
  constructor(private readonly configService: GatewayConfigService) {}

  /**
   * The project comes from the gateway config, never from the caller. With an
   * `ownUsage` scope, only usage of keys bound to that user is counted; the
   * filter is ANDed with the query's own filters, so they can only narrow it.
   */
  async executeQuery(params: {
    organizationId: string;
    query: QueryType;
    usageScope: GatewayUsageScope;
  }) {
    if (params.query.view !== "observations") {
      throw new InvalidRequestError(
        "Gateway analytics only query observations",
      );
    }
    const projectId = await this.configService.getRecordingProjectId(
      params.organizationId,
    );
    if (!projectId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Gateway requests are not recorded",
      });
    }

    const ownerUserId = getKeyOwnerFilter(params.usageScope);
    const query: QueryType = {
      ...params.query,
      filters: [
        GATEWAY_TRAFFIC_FILTER,
        ...(ownerUserId === undefined ? [] : [keyOwnerFilter(ownerUserId)]),
        ...params.query.filters,
      ],
    };
    const validation = validateQuery(query, "v2");
    if (!validation.valid) throw new InvalidRequestError(validation.reason);

    return executeQuery(projectId, query, "v2", true);
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
