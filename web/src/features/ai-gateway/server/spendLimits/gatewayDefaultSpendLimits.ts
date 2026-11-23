import type { GatewaySpendLimitScope as GatewaySpendLimitScopeColumn } from "@langfuse/shared/src/db";

import type { GatewaySpendLimitScope } from "./gatewaySpendLimitScope";

/** The scope of the organization's default limit for keys or for users without a limit of their own. */
export const GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES = {
  API_KEY: "API_KEY_DEFAULT",
  USER: "USER_DEFAULT",
} as const satisfies Record<
  GatewaySpendLimitScope["type"],
  GatewaySpendLimitScopeColumn
>;

/**
 * Joins a default limit's id and the key or user it applies to into the limit
 * id resolve sends. The gateway keys its counters by that id, so each key or
 * user counts its own spend against the default.
 */
export const GATEWAY_DEFAULT_SPEND_LIMIT_ID_SEPARATOR = ":";

/**
 * Effective counting start for one subject under a default limit: the subject's
 * latest reset when it is later than the default's own start.
 */
export function getEffectiveDefaultCountingStartedAt(
  defaultCountingStartedAt: Date,
  resetCountingStartedAt?: Date | null,
) {
  return resetCountingStartedAt &&
    resetCountingStartedAt.getTime() > defaultCountingStartedAt.getTime()
    ? resetCountingStartedAt
    : defaultCountingStartedAt;
}
