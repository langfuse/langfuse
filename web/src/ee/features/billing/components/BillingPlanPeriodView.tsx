import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { formatLocalIsoDate } from "@/src/components/LocalIsoDate";
import { BillingCurrentPlanLabel } from "./BillingCurrentPlanLabel";

export const BillingPlanPeriodView = () => {
  const router = useRouter();
  const orgId = router.query.organizationId as string | undefined;

  const { data, isLoading } = api.cloudBilling.getSubscriptionInfo.useQuery(
    { orgId: orgId ?? "" },
    { enabled: Boolean(orgId) },
  );

  return (
    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
      <BillingCurrentPlanLabel />
      <p>
        Billing period:{" "}
        {!isLoading && data?.billingPeriod && (
          <>
            {`${formatLocalIsoDate(data.billingPeriod.start, false, "day")} - ${formatLocalIsoDate(data.billingPeriod.end, false, "day")}`}
          </>
        )}
      </p>
    </div>
  );
};

export default BillingPlanPeriodView;
