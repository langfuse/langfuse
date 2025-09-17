import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

/**
 * Utilities for managing Stripe client references in a multi-region deployment.
 * Client references are used to link Stripe subscriptions to organizations and ensure
 * webhooks are processed in the correct cloud region.
 *
 * Flow:
 * 1. createStripeClientReference: Creates reference during checkout (stripeBillingService.ts)
 * 2. isStripeClientReferenceFromCurrentCloudRegion: Validates region in webhooks
 * 3. getOrgIdFromStripeClientReference: Extracts org ID for processing
 *
 * Format: `${cloudRegion}-${orgId}`
 * Example: "EU-org_123" or "US-org_456"
 */

/**
 * Creates a Stripe client reference by combining cloud region and organization ID.
 * Used when creating new checkout sessions in stripeBillingService.ts.
 *
 * @throws {TRPCError} If not running in a Langfuse Cloud environment
 */
export const createStripeClientReference = (orgId: string) => {
  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    logger.error(
      "Returning null stripeClientReference, you cannot run the checkout page outside of Langfuse Cloud",
    );
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Cannot create stripe client reference outside of Langfuse Cloud",
    });
  }
  return `${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}-${orgId}`;
};

/**
 * Validates if a client reference belongs to the current cloud region.
 * Used in stripeWebhookHandler.ts to ensure webhooks are processed in the correct region.
 *
 * @param clientReference - The client reference from Stripe (format: "REGION-orgId")
 * @returns true if the reference matches the current cloud region
 */
export const isStripeClientReferenceFromCurrentCloudRegion = (
  clientReference: string,
) =>
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
  clientReference.startsWith(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

/**
 * Extracts the organization ID from a client reference.
 * Used in stripeWebhookHandler.ts after validating the cloud region.
 *
 * @param clientReference - The client reference from Stripe (format: "REGION-orgId")
 * @returns The extracted organization ID
 */
export const getOrgIdFromStripeClientReference = (clientReference: string) =>
  clientReference.replace(`${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}-`, "");
