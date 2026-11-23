import {
  type ParsedOrganization,
  TooManyRequestsError,
} from "@langfuse/shared";

import { getOrganizationPlanServerSide } from "@langfuse/shared/src/server";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";

/**
 * Caps coupon checks per organization, so codes cannot be found by trying
 * many. Like every `RateLimitService` resource, it fails open when Redis is
 * unavailable.
 */
export async function assertCouponRedemptionRateLimit(
  org: ParsedOrganization,
): Promise<void> {
  const rateLimit = await RateLimitService.getInstance().rateLimitRequest(
    {
      orgId: org.id,
      plan: getOrganizationPlanServerSide(org.cloudConfig ?? undefined),
      projectId: null,
      accessLevel: "organization",
      rateLimitOverrides: org.cloudConfig?.rateLimitOverrides ?? [],
      // The scope only keys the rate limit; no API key is involved.
      apiKeyId: "coupon-redemption",
      publicKey: "coupon-redemption",
      isIngestionSuspended: false,
      accessAuditLogEnabled: null,
    },
    "coupon-redemption",
  );
  if (!rateLimit.isRateLimited()) return;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((rateLimit.res?.msBeforeNext ?? 1_000) / 1_000),
  );
  throw new TooManyRequestsError(
    `Too many coupon attempts. Please retry in ${retryAfterSeconds} seconds.`,
  );
}
