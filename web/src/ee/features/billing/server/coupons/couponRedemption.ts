import { type CloudConfigSchema, InvalidRequestError } from "@langfuse/shared";

import { type CouponProgram } from "../../utils/coupons";

/**
 * What the GTM coupon endpoint receives for one redemption. GTM resolves the
 * ClickHouse organization in Salesforce and grants the program's credits to it.
 *
 * Everything except `program` and `couponCode` is inferred server-side from
 * the session and the organization, so a user cannot redeem a coupon for an
 * organization or identity other than their own.
 */
export type CouponRedemptionPayload = {
  program: CouponProgram;
  couponCode: string;
  submitterEmail: string;
  clickhouseOrganizationId: string;
  langfuseOrganizationId: string;
  langfuseCloudRegion: string | null;
};

/**
 * Builds the redemption payload, or throws when the organization cannot
 * receive credits yet.
 *
 * Credits land on the ClickHouse organization, which exists only after a
 * checkout. Requiring an attached plan as well means the organization has
 * completed checkout with a payment method, not just started one.
 */
export function buildCouponRedemptionPayload({
  org,
  submitterEmail,
  program,
  couponCode,
  cloudRegion,
}: {
  org: { id: string; cloudConfig: CloudConfigSchema | null };
  submitterEmail: string | null | undefined;
  program: CouponProgram;
  couponCode: string;
  cloudRegion: string | null | undefined;
}): CouponRedemptionPayload {
  const clickhouse = org.cloudConfig?.clickhouse;
  if (!clickhouse?.organizationId || !clickhouse.attachedPlanId) {
    throw new InvalidRequestError(
      "Coupons can be redeemed once your organization is on a paid plan. Upgrade your plan first, then redeem the coupon.",
    );
  }
  if (!submitterEmail) {
    throw new InvalidRequestError(
      "Your account needs an email address to redeem a coupon.",
    );
  }

  return {
    program,
    couponCode,
    submitterEmail,
    clickhouseOrganizationId: clickhouse.organizationId,
    langfuseOrganizationId: org.id,
    langfuseCloudRegion: cloudRegion ?? null,
  };
}
