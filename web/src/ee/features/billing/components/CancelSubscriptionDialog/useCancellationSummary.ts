import { type Plan } from "@langfuse/shared";

import { useBillingInformation } from "@/src/ee/features/billing/components/useBillingInformation";
import { isCloudPlan } from "@/src/ee/features/billing/fns/isCloudPlan";
import { overLimitMarkers } from "@/src/ee/features/billing/fns/overLimitMarkers";
import { planLimitChanges } from "@/src/ee/features/billing/fns/planLimitChanges";
import { planLineChanges } from "@/src/ee/features/billing/fns/planLineChanges";
import { formatBillingDate } from "@/src/ee/features/billing/utils/formatBillingDate";
import { api } from "@/src/utils/api";

/** What the confirm step shows: the lines the organization gives up and Hobby's limits. */
export function useCancellationSummary() {
  const { organization, planLabel, billingPeriod } = useBillingInformation();
  const orgId = organization?.id ?? "";
  const enabled = Boolean(orgId);
  const memberCount = api.members.allFromOrg.useQuery(
    { orgId, page: 0, limit: 1 },
    { enabled },
  ).data?.totalCount;
  const unitsThisPeriod = api.cloudBilling.getUsage.useQuery(
    { orgId },
    { enabled },
  ).data?.usageCount;
  const plan = organization?.plan as Plan | undefined;

  return {
    planLabel,
    periodEnd: billingPeriod ? formatBillingDate(billingPeriod.end) : null,
    /** Missing for a plan a customer cannot cancel from (self-hosted, a trial). */
    loss: isCloudPlan(plan)
      ? {
          lost: planLineChanges(plan, "cloud:hobby"),
          limits: planLimitChanges(plan, "cloud:hobby"),
          markers: overLimitMarkers("cloud:hobby", {
            memberCount,
            unitsThisPeriod,
          }),
        }
      : null,
  };
}
