import { env } from "@/src/env.mjs";
import { InternalServerError, InvalidRequestError } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

import { type CouponRedemptionPayload } from "./couponRedemption";

/**
 * Delivers a coupon redemption to the GTM coupon endpoint, which records it in
 * Salesforce and grants the program's credits to the ClickHouse organization.
 * Users only interact with the Langfuse page, never with the GTM form.
 *
 * The submitter is the only code that knows the endpoint's wire format and
 * authentication, so either can change without touching the router or page.
 */
type CouponRedemptionSubmitter = {
  submit(payload: CouponRedemptionPayload): Promise<void>;
};

const SUBMISSION_TIMEOUT_MS = 10_000;

/** Endpoint answers that blame the submitted code or program, not our side. */
const REJECTED_SUBMISSION_STATUSES = new Set([400, 422]);

const createHttpCouponRedemptionSubmitter = ({
  url,
  secret,
}: {
  url: string;
  secret: string | undefined;
}): CouponRedemptionSubmitter => ({
  async submit(payload) {
    // Coupon codes and emails stay out of the logs.
    const logContext = {
      langfuseOrganizationId: payload.langfuseOrganizationId,
      clickhouseOrganizationId: payload.clickhouseOrganizationId,
      program: payload.program,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret && { Authorization: `Bearer ${secret}` }),
        },
        body: JSON.stringify({
          ...payload,
          submittedAt: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(SUBMISSION_TIMEOUT_MS),
      });
    } catch (error) {
      logger.error("Coupon redemption request failed", {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerError("Coupon redemption request failed");
    }

    if (response.ok) return;

    logger.error("Coupon redemption was not accepted", {
      ...logContext,
      status: response.status,
    });
    if (REJECTED_SUBMISSION_STATUSES.has(response.status)) {
      throw new InvalidRequestError(
        "This coupon could not be redeemed. Check the code and the program, or contact support.",
      );
    }
    throw new InternalServerError(
      `Coupon redemption endpoint answered ${response.status}`,
    );
  },
});

/**
 * The coupon submitter for this deployment, or null when no endpoint is
 * configured. Callers treat null as "redemption unavailable" and fail closed.
 */
export const getCouponRedemptionSubmitter =
  (): CouponRedemptionSubmitter | null =>
    env.LANGFUSE_CLOUD_COUPON_REDEMPTION_URL
      ? createHttpCouponRedemptionSubmitter({
          url: env.LANGFUSE_CLOUD_COUPON_REDEMPTION_URL,
          secret: env.LANGFUSE_CLOUD_COUPON_REDEMPTION_SECRET,
        })
      : null;
