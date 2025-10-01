import type { Organization } from "@prisma/client";
import { prisma } from "@langfuse/shared/src/db";
import { type ParsedOrganization, Role } from "@langfuse/shared";
import {
  sendUsageThresholdWarningEmail,
  sendUsageThresholdSuspensionEmail,
  logger,
  invalidateOrgApiKeys,
} from "@langfuse/shared/src/server";
import {
  NOTIFICATION_THRESHOLDS,
  BLOCKING_THRESHOLD,
  type NotificationThreshold,
  MAX_EVENTS_FREE_PLAN,
} from "./constants";
import { env } from "../../env";

/**
 * Get email addresses for OWNER and ADMIN members of an organization
 */
async function getOrgAdminEmails(orgId: string): Promise<string[]> {
  const adminMembers = await prisma.organizationMembership.findMany({
    where: {
      orgId,
      role: { in: [Role.ADMIN, Role.OWNER] },
    },
    include: {
      user: {
        select: { email: true },
      },
    },
  });

  return adminMembers
    .map((m) => m.user.email)
    .filter((email): email is string => !!email);
}

/**
 * GTM-1464: Send threshold notification email
 *
 * Sends usage notification to all OWNER/ADMIN users when 50k or 100k threshold is crossed
 *
 * @param org - Organization that crossed threshold
 * @param threshold - The notification threshold that was breached
 * @param cumulativeUsage - Current cumulative usage for the billing cycle
 */
async function sendThresholdNotificationEmail(
  org: Organization | ParsedOrganization,
  threshold: NotificationThreshold,
  cumulativeUsage: number,
): Promise<void> {
  try {
    // Get admin/owner emails
    const adminEmails = await getOrgAdminEmails(org.id);

    if (adminEmails.length === 0) {
      logger.warn(
        `[USAGE THRESHOLDS] No admin/owner emails found for org ${org.id}`,
      );
      return;
    }

    // Generate billing URL
    const billingUrl = env.NEXTAUTH_URL
      ? `${env.NEXTAUTH_URL}/organization/${org.id}/settings/billing`
      : `https://cloud.langfuse.com/organization/${org.id}/settings/billing`;

    // Send email to each admin/owner
    const emailPromises = adminEmails.map(async (email) => {
      try {
        await sendUsageThresholdWarningEmail({
          env,
          organizationName: org.name,
          currentUsage: cumulativeUsage,
          limit: MAX_EVENTS_FREE_PLAN,
          billingUrl,
          receiverEmail: email,
        });

        logger.info(
          `[USAGE THRESHOLDS] Usage notification email sent to ${email} for org ${org.id}`,
        );
      } catch (error) {
        logger.error(
          `[USAGE THRESHOLDS] Failed to send usage notification email to ${email} for org ${org.id}`,
          error,
        );
      }
    });

    await Promise.all(emailPromises);
  } catch (error) {
    logger.error(
      `[USAGE THRESHOLDS] Error sending threshold notification for org ${org.id}`,
      error,
    );
  }
}

/**
 * GTM-1464: Send blocking notification email
 *
 * Sends ingestion suspended email to all OWNER/ADMIN users when 200k threshold is crossed
 *
 * @param org - Organization that was blocked
 * @param cumulativeUsage - Current cumulative usage for the billing cycle
 */
async function sendBlockingNotificationEmail(
  org: Organization | ParsedOrganization,
  cumulativeUsage: number,
): Promise<void> {
  try {
    // Get admin/owner emails
    const adminEmails = await getOrgAdminEmails(org.id);

    if (adminEmails.length === 0) {
      logger.warn(
        `[USAGE THRESHOLDS] No admin/owner emails found for org ${org.id}`,
      );
      return;
    }

    // Generate billing URL
    const billingUrl = env.NEXTAUTH_URL
      ? `${env.NEXTAUTH_URL}/organization/${org.id}/settings/billing`
      : `https://cloud.langfuse.com/organization/${org.id}/settings/billing`;

    // Send email to each admin/owner
    const emailPromises = adminEmails.map(async (email) => {
      try {
        await sendUsageThresholdSuspensionEmail({
          env,
          organizationName: org.name,
          currentUsage: cumulativeUsage,
          limit: MAX_EVENTS_FREE_PLAN,
          billingUrl,
          receiverEmail: email,
        });

        logger.info(
          `[USAGE THRESHOLDS] Ingestion suspended email sent to ${email} for org ${org.id}`,
        );
      } catch (error) {
        logger.error(
          `[USAGE THRESHOLDS] Failed to send ingestion suspended email to ${email} for org ${org.id}`,
          error,
        );
      }
    });

    await Promise.all(emailPromises);
  } catch (error) {
    logger.error(
      `[USAGE THRESHOLDS] Error sending blocking notification for org ${org.id}`,
      error,
    );
  }
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
  org: ParsedOrganization,
  cumulativeUsage: number,
): Promise<void> {
  // 0. GTM-1465: Check if enforcement is enabled
  if (env.LANGFUSE_USAGE_THRESHOLD_ENFORCEMENT_ENABLED !== "true") {
    logger.info(
      `[USAGE THRESHOLDS] Enforcement disabled via feature flag for org ${org.id}, tracking usage only`,
    );

    if (org.billingCycleUsageState) {
      // if enforcement was enabled and is now disabled, enabled all orgs
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          billingCycleLastUsage: cumulativeUsage,
          billingCycleLastUpdatedAt: new Date(), // Stored as UTC in timestamptz column
          billingCycleUsageState: null,
        },
      });
    }
    return;
  }

  // 1. Skip notifications if org is on a paid plan
  if (org.cloudConfig?.stripe?.activeSubscriptionId) {
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        billingCycleLastUsage: cumulativeUsage,
        billingCycleLastUpdatedAt: new Date(), // Stored as UTC in timestamptz column
        billingCycleUsageState: null,
      },
    });

    // If org was previously blocked, invalidate cache
    if (org.billingCycleUsageState === "BLOCKED") {
      logger.info(
        `[USAGE THRESHOLDS] Org ${org.id} moved to paid plan, was previously blocked, invalidating API key cache`,
      );
      await invalidateOrgApiKeys(org.id);
    }

    return;
  }

  // 2. Get last processed usage (use billingCycleLastUsage field, default 0)
  const lastProcessedUsage = org.billingCycleLastUsage ?? 0;

  // 3. Detect threshold crossings since last check
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

  // 4. Send email - blocking email takes precedence
  let usageState: string | null = null;

  if (shouldBlock) {
    // Blocking threshold crossed - send blocking email (takes precedence)
    await sendBlockingNotificationEmail(org, cumulativeUsage);
    usageState = "BLOCKED";
  } else if (crossedNotificationThresholds.length > 0) {
    // Only notification thresholds crossed - send highest one
    const highestThreshold = Math.max(...crossedNotificationThresholds);
    await sendThresholdNotificationEmail(
      org,
      highestThreshold,
      cumulativeUsage,
    );
    usageState = "WARNING";
  }

  // 5. Update last processed usage in DB
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      billingCycleLastUsage: cumulativeUsage,
      billingCycleLastUpdatedAt: new Date(), // Stored as UTC in timestamptz column
      billingCycleUsageState: usageState,
    },
  });

  // 6. Invalidate API key cache if blocking state changed
  const previousState = org.billingCycleUsageState;
  const stateChanged =
    (previousState === "BLOCKED" && usageState !== "BLOCKED") ||
    (previousState !== "BLOCKED" && usageState === "BLOCKED");

  if (stateChanged) {
    logger.info(
      `[USAGE THRESHOLDS] Blocking state changed for org ${org.id}, invalidating API key cache`,
    );
    await invalidateOrgApiKeys(org.id);
  }
}
