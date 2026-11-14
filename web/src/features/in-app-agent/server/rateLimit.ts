import { BaseError, type RateLimitResult } from "@langfuse/shared";
import type { ApiAccessScope } from "@langfuse/shared/src/server";

import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";

async function checkInAppAgentRateLimit(
  scope: ApiAccessScope,
  resource: Parameters<RateLimitService["rateLimitRequest"]>[1],
): Promise<RateLimitResult | undefined> {
  const rateLimit = await RateLimitService.getInstance().rateLimitRequest(
    scope,
    resource,
  );

  return rateLimit.isRateLimited() ? (rateLimit.res ?? undefined) : undefined;
}

/** tRPC-shaped variant; BaseErrors bubble to the tRPC error middleware. */
export async function assertInAppAgentRateLimit(
  scope: ApiAccessScope,
  resource: Parameters<RateLimitService["rateLimitRequest"]>[1],
): Promise<void> {
  const rateLimitRes = await checkInAppAgentRateLimit(scope, resource);

  if (!rateLimitRes) {
    return;
  }

  throw new BaseError(
    "TooManyRequestsError",
    429,
    `Too many Halo requests. Please retry in ${Math.ceil(
      rateLimitRes.msBeforeNext / 1_000,
    )} seconds.`,
    true,
  );
}
