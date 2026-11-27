/* eslint-disable @repo/export-rules */
import type { GatewaySpendLimitInterval } from "@langfuse/shared/src/db";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Start of the UTC calendar window `now` falls in: midnight, the Monday of the
 * week, or the 1st of the month. A total limit never refreshes, so its one
 * window starts at the Unix epoch.
 *
 * The gateway computes the same windows in `ai-gateway/src/spend/window.rs`.
 */
export function getGatewaySpendLimitWindowStart(
  interval: GatewaySpendLimitInterval,
  now: Date = new Date(),
): Date {
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  switch (interval) {
    case "DAILY":
      return new Date(midnight);
    case "WEEKLY":
      // getUTCDay is 0 for Sunday; weeks start on Monday.
      return new Date(midnight - ((now.getUTCDay() + 6) % 7) * DAY_MS);
    case "MONTHLY":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    case "TOTAL":
      return new Date(0);
  }
}

/** Start of the window after `windowStart`, or null for a total limit, which never resets. */
export function getGatewaySpendLimitWindowEnd(
  interval: GatewaySpendLimitInterval,
  windowStart: Date,
): Date | null {
  switch (interval) {
    case "DAILY":
      return new Date(windowStart.getTime() + DAY_MS);
    case "WEEKLY":
      return new Date(windowStart.getTime() + 7 * DAY_MS);
    case "MONTHLY":
      return new Date(
        Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + 1),
      );
    case "TOTAL":
      return null;
  }
}
