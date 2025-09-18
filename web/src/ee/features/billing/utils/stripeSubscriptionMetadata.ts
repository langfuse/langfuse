import { z } from "zod";

/**
 * Schema and type definitions for Stripe subscription metadata.
 * This metadata is crucial for multi-region deployment and organization tracking.
 *
 * Usage flow:
 * 1. Set during subscription creation in stripeBillingService.ts:
 *    - Added to subscription_data.metadata in createCheckoutSession
 *    - Contains orgId and cloudRegion for new subscriptions
 *
 * 2. Validated in stripeWebhookHandler.ts:
 *    - Used to ensure webhooks are processed in correct cloud region
 *    - Automatically added to subscriptions if missing via ensureMetadataIsSetOnStripeSubscription
 *    - Prevents duplicate subscription processing across regions
 *
 * @property orgId - Links the subscription to a specific organization
 * @property cloudRegion - Identifies which cloud region (e.g., EU, US) handles this subscription
 */
export const StripeSubscriptionMetadataSchema = z.object({
  orgId: z.string().optional(),
  cloudRegion: z.string().optional(),
});

export type StripeSubscriptionMetadata = z.infer<
  typeof StripeSubscriptionMetadataSchema
>;
