import type { Organization } from "@prisma/client";
import { prisma } from "@langfuse/shared/src/db";
import { type ParsedOrganization, Role } from "@langfuse/shared";
import {
  sendUsageThresholdWarningEmail,
  sendUsageThresholdSuspensionEmail,
  logger,
  recordIncrement,
  traceException,
  getBillingCycleEnd,
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
 *
 * Sends usage notification to all OWNER/ADMIN users when 50k or 100k threshold is crossed
 *
 * @param org - Organization that crossed threshold
 * @param threshold - The notification threshold that was breached
 * @param cumulativeUsage - Current cumulative usage for the billing cycle
 * @returns Object with emailSent and emailFailed flags
 */
async function sendThresholdNotificationEmail(
  org: Organization | ParsedOrganization,
  threshold: NotificationThreshold,
  cumulativeUsage: number,
  resetDate: Date,
): Promise<{ emailSent: boolean; emailFailed: boolean }> {
  let emailSent = false;
  let emailFailed = false;

  try {
    // Get admin/owner emails
    const adminEmails = await getOrgAdminEmails(org.id);

    if (adminEmails.length === 0) {
      logger.warn(
        `[FREE TIER USAGE THRESHOLDS] No admin/owner emails found for org ${org.id}`,
      );
      return { emailSent: false, emailFailed: false };
    }

    // Note: We assume that we run in a cloud environment, so the NEXTAUTH_URL must be set
    if (!env.NEXTAUTH_URL) {
      logger.error(
        `[FREE TIER USAGE THRESHOLDS] NEXTAUTH_URL is not set, cannot send usage notification email for org ${org.id}`,
      );
      traceException(
        `[FREE TIER USAGE THRESHOLDS] NEXTAUTH_URL is not set, cannot send usage notification email for org ${org.id}`,
      );
      return { emailSent: false, emailFailed: false };
    }

    // Generate billing URL
    const billingUrl = `${env.NEXTAUTH_URL}/organization/${org.id}/settings/billing`;

    // Send email to each admin/owner
    const emailResults = await Promise.allSettled(
      adminEmails.map(async (email) => {
        await sendUsageThresholdWarningEmail({
          env,
          organizationName: org.name,
          currentUsage: cumulativeUsage,
          limit: MAX_EVENTS_FREE_PLAN,
          billingUrl,
          receiverEmail: email,
          resetDate: resetDate.toISOString(),
        });

        logger.info(
          `[FREE TIER USAGE THRESHOLDS] Usage notification email sent to ${email} for org ${org.id}`,
        );
      }),
    );

    // Check if any emails succeeded or failed
    for (const result of emailResults) {
      if (result.status === "fulfilled") {
        emailSent = true;
      } else {
        emailFailed = true;
        logger.error(
          `[FREE TIER USAGE THRESHOLDS] Failed to send usage notification email for org ${org.id}`,
          result.reason,
        );
      }
    }

    // Record metrics once per org (not per recipient)
    if (emailSent) {
      recordIncrement(
        "langfuse.queue.usage_threshold_queue.warning_emails_sent",
        1,
        {
          unit: "emails",
        },
      );
    }
    if (emailFailed) {
      recordIncrement(
        "langfuse.queue.usage_threshold_queue.email_failures",
        1,
        {
          unit: "emails",
        },
      );
    }
  } catch (error) {
    logger.error(
      `[FREE TIER USAGE THRESHOLDS] Error sending threshold notification for org ${org.id}`,
      error,
    );
    emailFailed = true;
    recordIncrement("langfuse.queue.usage_threshold_queue.email_failures", 1, {
      unit: "emails",
    });
  }

  return { emailSent, emailFailed };
}

/**
 *
 * Sends ingestion suspended email to all OWNER/ADMIN users when 200k threshold is crossed
 *
 * @param org - Organization that was blocked
 * @param cumulativeUsage - Current cumulative usage for the billing cycle
 * @returns Object with emailSent and emailFailed flags
 */
async function sendBlockingNotificationEmail(
  org: Organization | ParsedOrganization,
  cumulativeUsage: number,
  resetDate: Date,
): Promise<{ emailSent: boolean; emailFailed: boolean }> {
  let emailSent = false;
  let emailFailed = false;

  try {
    // Get admin/owner emails
    const adminEmails = await getOrgAdminEmails(org.id);

    if (adminEmails.length === 0) {
      logger.warn(
        `[FREE TIER USAGE THRESHOLDS] No admin/owner emails found for org ${org.id}`,
      );
      return { emailSent: false, emailFailed: false };
    }

    // Note: We assume that we run in a cloud environment, so the NEXTAUTH_URL must be set
    if (!env.NEXTAUTH_URL) {
      logger.error(
        `[FREE TIER USAGE THRESHOLDS] NEXTAUTH_URL is not set, cannot send ingestion suspended email for org ${org.id}`,
      );
      traceException(
        `[FREE TIER USAGE THRESHOLDS] NEXTAUTH_URL is not set, cannot send ingestion suspended email for org ${org.id}`,
      );
      return { emailSent: false, emailFailed: false };
    }

    // Generate billing URL
    const billingUrl = `${env.NEXTAUTH_URL}/organization/${org.id}/settings/billing`;

    // Send email to each admin/owner
    const emailResults = await Promise.allSettled(
      adminEmails.map(async (email) => {
        await sendUsageThresholdSuspensionEmail({
          env,
          organizationName: org.name,
          currentUsage: cumulativeUsage,
          limit: MAX_EVENTS_FREE_PLAN,
          billingUrl,
          receiverEmail: email,
          resetDate: resetDate.toISOString(),
        });

        logger.info(
          `[FREE TIER USAGE THRESHOLDS] Ingestion suspended email sent to ${email} for org ${org.id}`,
        );
      }),
    );

    // Check if any emails succeeded or failed
    for (const result of emailResults) {
      if (result.status === "fulfilled") {
        emailSent = true;
      } else {
        emailFailed = true;
        logger.error(
          `[FREE TIER USAGE THRESHOLDS] Failed to send ingestion suspended email for org ${org.id}`,
          result.reason,
        );
      }
    }

    // Record metrics once per org (not per recipient)
    if (emailSent) {
      recordIncrement(
        "langfuse.queue.usage_threshold_queue.blocking_emails_sent",
        1,
        {
          unit: "emails",
        },
      );
    }
    if (emailFailed) {
      recordIncrement(
        "langfuse.queue.usage_threshold_queue.email_failures",
        1,
        {
          unit: "emails",
        },
      );
    }
  } catch (error) {
    logger.error(
      `[FREE TIER USAGE THRESHOLDS] Error sending blocking notification for org ${org.id}`,
      error,
    );
    emailFailed = true;
    recordIncrement("langfuse.queue.usage_threshold_queue.email_failures", 1, {
      unit: "emails",
    });
  }

  return { emailSent, emailFailed };
}

/**
 * Data needed to update an organization's usage tracking fields
 */
export type OrgUpdateData = {
  orgId: string;
  cloudCurrentCycleUsage: number;
  cloudBillingCycleUpdatedAt: Date;
  cloudFreeTierUsageThresholdState: string | null;
  shouldInvalidateCache: boolean; // For API key cache invalidation
};

/**
 * Action taken during threshold processing
 */
export type ThresholdProcessingResult = {
  actionTaken:
    | "BLOCKED"
    | "WARNING"
    | "PAID_PLAN"
    | "ENFORCEMENT_DISABLED"
    | "NONE";
  emailSent: boolean;
  emailFailed: boolean;
  updateData: OrgUpdateData; // Update data to be executed in bulk
};

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
 * @returns ThresholdProcessingResult with action taken and email status
 */
export async function processThresholds(
  org: ParsedOrganization,
  cumulativeUsage: number,
): Promise<ThresholdProcessingResult> {
  // 1. Skip notifications if org is on a paid plan (check this first, regardless of enforcement flag)
  // This includes both Stripe subscriptions and manual plan overrides
  if (org.cloudConfig?.stripe?.activeSubscriptionId || org.cloudConfig?.plan) {
    // Build update data
    const updateData: OrgUpdateData = {
      orgId: org.id,
      cloudCurrentCycleUsage: cumulativeUsage,
      cloudBillingCycleUpdatedAt: new Date(),
      cloudFreeTierUsageThresholdState: null,
      // If org was previously blocked, invalidate cache
      shouldInvalidateCache: org.cloudFreeTierUsageThresholdState === "BLOCKED",
    };

    if (updateData.shouldInvalidateCache) {
      logger.info(
        `[FREE TIER USAGE THRESHOLDS] Org ${org.id} moved to paid plan, was previously blocked, will invalidate API key cache`,
      );
    }

    return {
      actionTaken: "PAID_PLAN",
      emailSent: false,
      emailFailed: false,
      updateData,
    };
  }

  // 2. Check if enforcement is enabled (only for free tier orgs)
  if (env.LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED !== "true") {
    // Always track usage even when enforcement is disabled
    const updateData: OrgUpdateData = {
      orgId: org.id,
      cloudCurrentCycleUsage: cumulativeUsage,
      cloudBillingCycleUpdatedAt: new Date(),
      cloudFreeTierUsageThresholdState: null,
      shouldInvalidateCache: false,
    };

    return {
      actionTaken: "ENFORCEMENT_DISABLED",
      emailSent: false,
      emailFailed: false,
      updateData,
    };
  }

  // 3. Get previous state
  const previousState = org.cloudFreeTierUsageThresholdState;

  // 4. Determine current state based on cumulative usage (state-based, not transition-based)
  // This makes the system idempotent and self-healing
  let currentState: string | null = null;

  if (cumulativeUsage >= BLOCKING_THRESHOLD) {
    currentState = "BLOCKED";
  } else if (cumulativeUsage >= NOTIFICATION_THRESHOLDS[0]) {
    // Above any notification threshold
    currentState = "WARNING";
  } else {
    currentState = null;
  }

  // 5. Determine if we should send email (only on state transitions)
  let emailSent = false;
  let emailFailed = false;

  // Check for state transition
  const stateTransitioned = previousState !== currentState;

  // Calculate reset date for emails
  const resetDate = getBillingCycleEnd(org, new Date());

  if (stateTransitioned && currentState === "BLOCKED") {
    // Transitioning to BLOCKED state - send blocking email
    recordIncrement(
      "langfuse.queue.usage_threshold_queue.blocked_orgs_total",
      1,
      {
        unit: "organizations",
      },
    );
    const emailResult = await sendBlockingNotificationEmail(
      org,
      cumulativeUsage,
      resetDate,
    );
    emailSent = emailResult.emailSent;
    emailFailed = emailResult.emailFailed;
  } else if (stateTransitioned && currentState === "WARNING") {
    // Transitioning to WARNING state - send warning email
    recordIncrement(
      "langfuse.queue.usage_threshold_queue.warning_orgs_total",
      1,
      {
        unit: "organizations",
      },
    );
    // Determine which threshold was crossed
    const highestCrossedThreshold = Math.max(
      ...NOTIFICATION_THRESHOLDS.filter((t) => cumulativeUsage >= t),
    );
    const emailResult = await sendThresholdNotificationEmail(
      org,
      highestCrossedThreshold,
      cumulativeUsage,
      resetDate,
    );
    emailSent = emailResult.emailSent;
    emailFailed = emailResult.emailFailed;
  }

  // 6. Determine if API key cache should be invalidated
  const blockingStateChanged =
    (previousState === "BLOCKED" && currentState !== "BLOCKED") ||
    (previousState !== "BLOCKED" && currentState === "BLOCKED");

  if (blockingStateChanged) {
    logger.info(
      `[FREE TIER USAGE THRESHOLDS] Blocking state changed for org ${org.id}, will invalidate API key cache`,
    );
  }

  // 7. Build update data (to be executed in bulk)
  const updateData: OrgUpdateData = {
    orgId: org.id,
    cloudCurrentCycleUsage: cumulativeUsage,
    cloudBillingCycleUpdatedAt: new Date(), // Stored as UTC in timestamptz column
    cloudFreeTierUsageThresholdState: currentState,
    shouldInvalidateCache: blockingStateChanged,
  };

  // 8. Return result for metrics tracking
  const actionTaken =
    currentState === "BLOCKED"
      ? "BLOCKED"
      : currentState === "WARNING"
        ? "WARNING"
        : "NONE";
  return {
    actionTaken,
    emailSent,
    emailFailed,
    updateData,
  };
}
