import type { GatewaySpendLimitInterval } from "@langfuse/shared/src/db";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Start of the UTC calendar window `now` falls in: midnight, the Monday of the
 * week, or the 1st of the month. A lifetime limit never refreshes, so its one
 * window starts at the Unix epoch.
 *
 * The gateway computes the same windows in `ai-gateway/src/spend/window.rs`
 * and only applies a stored baseline while its window start matches.
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
    case "LIFETIME":
      return new Date(0);
  }
}
