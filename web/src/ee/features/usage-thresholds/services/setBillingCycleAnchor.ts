import { prisma } from "@langfuse/shared/src/db";

/**
 * Converts a date to UTC start of day (00:00:00.000)
 */
function startOfDayUTC(date: Date): Date {
  const d = new Date(date);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/**
 * Get organization create data with billing cycle anchor set to start of day UTC
 */
export function getOrgCreateDataWithAnchor<T extends Record<string, unknown>>(
  baseData: T,
): T & { billingCycleAnchor: Date } {
  return {
    ...baseData,
    billingCycleAnchor: startOfDayUTC(new Date()),
  };
}

/**
 * Update organization billing cycle anchor to start of day UTC
 */
export async function updateOrgBillingCycleAnchor(
  orgId: string,
  anchor?: Date,
) {
  return await prisma.organization.update({
    where: { id: orgId },
    data: {
      billingCycleAnchor: startOfDayUTC(anchor ?? new Date()),
    },
  });
}
