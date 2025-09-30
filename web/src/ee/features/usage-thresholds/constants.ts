import { MAX_EVENTS_FREE_PLAN } from "@/src/ee/features/billing/constants";

/**
 * Usage threshold constants for free-tier enforcement
 *
 * Base threshold is MAX_EVENTS_FREE_PLAN (50,000) from billing constants
 */

/**
 * Notification thresholds trigger email alerts
 * Multiple thresholds can be breached, but only ONE email is sent per job run
 * with the highest breached threshold
 */
export const NOTIFICATION_THRESHOLDS = [
  MAX_EVENTS_FREE_PLAN, // 50,000
  MAX_EVENTS_FREE_PLAN * 2, // 100,000
] as const;

/**
 * Blocking threshold triggers API blocking
 * When reached, ingestion endpoints are blocked for the organization
 */
export const BLOCKING_THRESHOLD = MAX_EVENTS_FREE_PLAN * 4; // 200,000

/**
 * All thresholds combined for validation
 */
export const ALL_THRESHOLDS = [
  ...NOTIFICATION_THRESHOLDS,
  BLOCKING_THRESHOLD,
] as const;

export type NotificationThreshold = (typeof NOTIFICATION_THRESHOLDS)[number];
export type BlockingThreshold = typeof BLOCKING_THRESHOLD;
export type Threshold = (typeof ALL_THRESHOLDS)[number];
