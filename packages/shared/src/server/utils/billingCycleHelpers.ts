import { getDaysInMonth, subMonths } from "date-fns";
import type { Organization } from "@prisma/client";

/**
 * Start of day in UTC (00:00:00.000Z)
 */
export function startOfDayUTC(date: Date): Date {
  const d = new Date(date);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/**
 * End of day in UTC (23:59:59.999Z)
 */
export function endOfDayUTC(date: Date): Date {
  const d = new Date(date);
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

/**
 * Get billing cycle anchor with fallback to createdAt
 * Always returns start of day in UTC
 */
export function getBillingCycleAnchor(org: Organization): Date {
  return org.cloudBillingCycleAnchor
    ? startOfDayUTC(org.cloudBillingCycleAnchor)
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

/**
 * Calculate the billing cycle end date (when the usage limit resets)
 *
 * Returns the start of the next billing cycle, which is when the current cycle ends
 * and usage is reset.
 *
 * Example: If anchor is Jan 15 and reference is Jan 20:
 * - Current cycle start: Jan 15
 * - Next cycle start (reset date): Feb 15
 *
 * Handles month boundaries correctly (e.g., 31st → 28/29/30 for shorter months)
 *
 * @param org - Organization with billing cycle anchor
 * @param referenceDate - The current date (typically "now")
 * @returns Date when the usage limit resets (start of next billing cycle)
 */
export function getBillingCycleEnd(
  org: Organization,
  referenceDate: Date,
): Date {
  // Get the current cycle start using existing function
  const currentCycleStart = getBillingCycleStart(org, referenceDate);
  const anchor = getBillingCycleAnchor(org);
  const dayOfMonth = anchor.getUTCDate();

  // Calculate next month's cycle day (one month after current cycle start)
  const nextMonthDate = new Date(
    Date.UTC(
      currentCycleStart.getUTCFullYear(),
      currentCycleStart.getUTCMonth() + 1,
      1,
    ),
  );
  const daysInNextMonth = getDaysInMonth(nextMonthDate);
  const adjustedDay = Math.min(dayOfMonth, daysInNextMonth);

  return new Date(
    Date.UTC(
      nextMonthDate.getUTCFullYear(),
      nextMonthDate.getUTCMonth(),
      adjustedDay,
    ),
  );
}

/**
 * Calculate the maximum number of days to look back for a billing cycle
 *
 * Returns the number of days in the previous month relative to the reference date.
 * This ensures we capture a full billing cycle when processing usage.
 *
 * Examples:
 * - Reference date: March 15, 2024 → Look back 29 days (Feb has 29 days in 2024)
 * - Reference date: April 15, 2024 → Look back 31 days (March has 31 days)
 * - Reference date: May 15, 2024 → Look back 30 days (April has 30 days)
 *
 * @param referenceDate - The current date (typically "now")
 * @returns Number of days to look back to cover the full billing cycle
 */
export function getDaysToLookBack(referenceDate: Date): number {
  const refYear = referenceDate.getUTCFullYear();
  const refMonth = referenceDate.getUTCMonth();

  // Get the previous month
  const prevMonthDate = subMonths(new Date(Date.UTC(refYear, refMonth, 1)), 1);

  // Return the number of days in the previous month
  return getDaysInMonth(prevMonthDate);
}
