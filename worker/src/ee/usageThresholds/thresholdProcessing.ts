import type { Organization } from "@prisma/client";
import { prisma } from "@langfuse/shared/src/db";
import { type ParsedOrganization } from "@langfuse/shared";
import {
  NOTIFICATION_THRESHOLDS,
  BLOCKING_THRESHOLD,
  type NotificationThreshold,
} from "./constants";

/**
 * GTM-1464: Send threshold notification email
 *
 * Placeholder implementation - to be implemented in GTM-1464
 *
 * @param org - Organization that crossed threshold
 * @param threshold - The notification threshold that was breached
 */
async function sendThresholdNotificationEmail(
  org: Organization | ParsedOrganization,
  threshold: NotificationThreshold,
): Promise<void> {
  // TODO: Implement GTM-1464
  // Send email notification with:
  // - Current usage
  // - Threshold breached
  // - Next threshold or blocking warning
  // - Link to upgrade/manage usage
  throw new Error(
    `GTM-1464: Not implemented - sendThresholdNotificationEmail for org ${org.id} at threshold ${threshold}`,
  );
}

/**
 * GTM-1464: Send blocking notification email
 *
 * Placeholder implementation - to be implemented in GTM-1464
 *
 * @param org - Organization that was blocked
 */
async function sendBlockingNotificationEmail(
  org: Organization | ParsedOrganization,
): Promise<void> {
  // TODO: Implement GTM-1464
  // Send email notification with:
  // - Current usage (exceeded 200k)
  // - Ingestion has been blocked
  // - Instructions to upgrade or contact support
  // - Link to upgrade/manage usage
  throw new Error(
    `GTM-1464: Not implemented - sendBlockingNotificationEmail for org ${org.id}`,
  );
}

/**
 * GTM-1466: Block organization in Redis
 *
 * Placeholder implementation - to be implemented in GTM-1466
 *
 * @param orgId - Organization ID to block
 */
async function blockOrganization(orgId: string): Promise<void> {
  // TODO: Implement GTM-1466
  // Add orgId to Redis blocklist for quick ingestion endpoint checks
  throw new Error(
    `GTM-1466: Not implemented - blockOrganization for org ${orgId}`,
  );
}

/**
 * Process threshold crossings for an organization
 *
 * Called from usage aggregation engine when we reach an org's billing cycle start.
 * Detects threshold crossings since last check and triggers appropriate actions.
 *
 * Key Rules:
 * - Only ONE email per org per job run
 * - Blocking email takes precedence over notification emails
 * - If blocking threshold crossed: send blocking email AND block org
 * - Otherwise: send highest crossed notification email
 * - Idempotent: safe to call multiple times with same usage
 *
 * @param org - Full organization object (already fetched in aggregation setup)
 * @param cumulativeUsage - Total usage for the billing cycle
 */
export async function processThresholds(
  org: Organization | ParsedOrganization,
  cumulativeUsage: number,
): Promise<void> {
  // 1. Get last processed usage (use billingCycleLastUsage field, default 0)
  const lastProcessedUsage = org.billingCycleLastUsage ?? 0;

  // 2. Detect threshold crossings since last check
  const crossedNotificationThresholds: NotificationThreshold[] = [];
  let shouldBlock = false;

  // Check notification thresholds
  for (const threshold of NOTIFICATION_THRESHOLDS) {
    if (lastProcessedUsage < threshold && cumulativeUsage >= threshold) {
      crossedNotificationThresholds.push(threshold);
    }
  }

  // Check blocking threshold
  if (
    lastProcessedUsage < BLOCKING_THRESHOLD &&
    cumulativeUsage >= BLOCKING_THRESHOLD
  ) {
    shouldBlock = true;
  }

  // 3. Send email - blocking email takes precedence
  let usageState: string | null = null;

  if (shouldBlock) {
    // Blocking threshold crossed - send blocking email (takes precedence)
    await sendBlockingNotificationEmail(org);
    // Also block the organization
    await blockOrganization(org.id);
    usageState = "BLOCKED";
  } else if (crossedNotificationThresholds.length > 0) {
    // Only notification thresholds crossed - send highest one
    const highestThreshold = Math.max(...crossedNotificationThresholds);
    await sendThresholdNotificationEmail(
      org,
      highestThreshold as NotificationThreshold,
    );
    usageState = "WARNING";
  }

  // 4. Update last processed usage in DB
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      billingCycleLastUsage: cumulativeUsage,
      billingCycleLastUpdatedAt: new Date(), // Stored as UTC in timestamptz column
      ...(usageState && { billingCycleUsageState: usageState }),
    },
  });
}
