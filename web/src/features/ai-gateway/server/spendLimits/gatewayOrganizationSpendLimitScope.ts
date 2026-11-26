import type { GatewaySpendLimitScope } from "@langfuse/shared/src/db";

/** The scope of the organization's own limits, which cap all of its gateway spend; one per interval. */
export const GATEWAY_ORGANIZATION_SPEND_LIMIT_SCOPE =
  "ORGANIZATION" as const satisfies GatewaySpendLimitScope;
