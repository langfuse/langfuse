import { prisma } from "@langfuse/shared/src/db";
import { startOfDayUTC } from "@/src/ee/features/usage-thresholds/utils/billingCycleHelpers";

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
