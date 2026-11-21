import type { FilterCondition } from "@langfuse/shared";

/**
 * The ingestion project can also receive SDK traffic; only observations
 * ingestion attributed to a gateway key count as gateway usage.
 */
export const GATEWAY_TRAFFIC_FILTER: FilterCondition = {
  column: "aiGatewayKeyId",
  operator: "is not null",
  value: "",
  type: "null",
};
