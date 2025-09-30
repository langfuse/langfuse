import { getDaysInMonth, subMonths } from "date-fns";
import { type Organization } from "@langfuse/shared";

/**
 * Start of day in UTC (00:00:00.000Z)
 */
function startOfDayUTC(date: Date): Date {
  const d = new Date(date);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/**
 * Get billing cycle anchor with fallback to createdAt
 * Always returns start of day in UTC
 */
export function getBillingCycleAnchor(org: Organization): Date {
  return org.billingCycleAnchor
    ? startOfDayUTC(org.billingCycleAnchor)
    : startOfDayUTC(org.createdAt);
}

/**
 * Calculate the billing cycle start date for the billing cycle containing the reference date
 * Handles month boundaries correctly (e.g., 31st → 28/29/30 for shorter months)
 *
 * Returns the most recent occurrence of the billing cycle day that is on or before the reference date
 *
 * Example: If anchor is Jan 31 and reference is Feb 15:
 * - Feb cycle day would be Feb 29 (adjusted from 31 due to leap year)
 * - Since Feb 15 < Feb 29, we're still in Jan's cycle → return Jan 31
 *
 * Example: If anchor is Jan 15 and reference is Feb 20:
 * - Feb cycle day is Feb 15
 * - Since Feb 20 >= Feb 15, we're in Feb's cycle → return Feb 15
 */
export function getBillingCycleStart(
  org: Organization,
  referenceDate: Date,
): Date {
  const anchor = getBillingCycleAnchor(org);
  const dayOfMonth = anchor.getUTCDate(); // e.g. 31

  // Get reference month/year in UTC
  const refYear = referenceDate.getUTCFullYear();
  const refMonth = referenceDate.getUTCMonth();

  // Calculate adjusted day for current month (handles 31 → 28/29/30)
  const daysInRefMonth = getDaysInMonth(
    new Date(Date.UTC(refYear, refMonth, 1)),
  );
  const adjustedDay = Math.min(dayOfMonth, daysInRefMonth);

  const currentMonthCycleStart = new Date(
    Date.UTC(refYear, refMonth, adjustedDay),
  );

  // If current month's cycle start is after reference date, use previous month
  if (currentMonthCycleStart > referenceDate) {
    const prevDate = subMonths(new Date(Date.UTC(refYear, refMonth, 1)), 1);
    const daysInPrevMonth = getDaysInMonth(prevDate);
    return new Date(
      Date.UTC(
        prevDate.getUTCFullYear(),
        prevDate.getUTCMonth(),
        Math.min(dayOfMonth, daysInPrevMonth),
      ),
    );
  }

  return currentMonthCycleStart;
}
