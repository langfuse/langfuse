import { ENTERPRISE_TRIAL_UNIT_LIMIT } from "@langfuse/shared";
import { type UsageThresholdPlan } from "@langfuse/shared/src/server";

/**
 * Usage threshold constants for free-tier and enterprise-trial enforcement
 */

/**
 * Maximum events allowed in free plan (50,000)
 * Copied from web billing constants to avoid cross-package dependency
 */
const MAX_EVENTS_FREE_PLAN = 50_000;

/**
 * Notification thresholds trigger email alerts
 * Multiple thresholds can be breached, but only ONE email is sent per job run
 * with the highest breached threshold
 */
const NOTIFICATION_THRESHOLDS = [
  MAX_EVENTS_FREE_PLAN, // 50,000
  MAX_EVENTS_FREE_PLAN * 2, // 100,000
  MAX_EVENTS_FREE_PLAN * 4, // 200,000
] as const;

/**
 * Blocking threshold triggers API blocking
 * When reached, ingestion endpoints are blocked for the organization
 */
const BLOCKING_THRESHOLD = MAX_EVENTS_FREE_PLAN * 5; // 250,000

/** Thresholds enforced for one unpaid plan. */
export type UsageThresholdPolicy = {
  plan: UsageThresholdPlan;
  /** Limit named in the notification emails. */
  limit: number;
  /** Ascending; the first one moves the org into the WARNING state. */
  notificationThresholds: readonly number[];
  blockingThreshold: number;
};

export const FREE_TIER_USAGE_POLICY: UsageThresholdPolicy = {
  plan: "free-tier",
  limit: MAX_EVENTS_FREE_PLAN,
  notificationThresholds: NOTIFICATION_THRESHOLDS,
  blockingThreshold: BLOCKING_THRESHOLD,
};

/** Warns at 80% of the trial cap and blocks at the cap. */
export const ENTERPRISE_TRIAL_USAGE_POLICY: UsageThresholdPolicy = {
  plan: "enterprise-trial",
  limit: ENTERPRISE_TRIAL_UNIT_LIMIT,
  notificationThresholds: [ENTERPRISE_TRIAL_UNIT_LIMIT * 0.8],
  blockingThreshold: ENTERPRISE_TRIAL_UNIT_LIMIT,
};
