import { type CloudConfigSchema, InvalidRequestError } from "@langfuse/shared";

/**
 * The redemption values handed to ClickHouse's credit-request form. GTM
 * systems resolve the ClickHouse organization in Salesforce and grant the
 * program's credits to it.
 *
 * Only `couponCode` comes from the user. The program is looked up from the
 * code, and the rest is inferred from the session and the organization, so
 * the page only ever offers the user's own identity and organization.
 */
export type CouponRedemptionPayload = {
  /** The program name the credit-request form expects. */
  program: string;
  couponCode: string;
  submitterEmail: string;
  clickhouseOrganizationId: string;
};

/**
 * Builds the redemption payload. Returns null for a code that is not
 * configured, and throws when the organization cannot receive credits yet.
 *
 * Credits land on the ClickHouse organization, which exists only after a
 * checkout. Requiring an attached plan as well means the organization has
 * completed checkout with a payment method, not just started one. That check
 * runs first, so ineligible organizations learn nothing about codes.
 *
 * Codes match regardless of case and surrounding whitespace; the configured
 * spelling is what gets submitted.
 */
export function buildCouponRedemptionPayload({
  org,
  submitterEmail,
  couponCode,
  couponCodes,
}: {
  org: { id: string; cloudConfig: CloudConfigSchema | null };
  submitterEmail: string | null | undefined;
  couponCode: string;
  /** Configured coupon codes, mapped to their program name. */
  couponCodes: Record<string, string>;
}): CouponRedemptionPayload | null {
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

  const normalizedCode = couponCode.trim().toUpperCase();
  const match = Object.entries(couponCodes).find(
    ([code]) => code.trim().toUpperCase() === normalizedCode,
  );
  if (!match) return null;
  const [configuredCode, program] = match;

  return {
    program,
    couponCode: configuredCode,
    submitterEmail,
    clickhouseOrganizationId: clickhouse.organizationId,
  };
}
