import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { api } from "@/src/utils/api";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { MAX_EVENTS_FREE_PLAN } from "@/src/ee/features/billing/constants";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";

export const UsageTracker = () => {
  const { organization } = useQueryProjectOrOrganization();
  const hasEntitlement = useHasEntitlement("cloud-billing");
  const hasAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "langfuseCloudBilling:CRUD",
  });

  const usageQuery = api.cloudBilling.getUsage.useQuery(
    {
      orgId: organization?.id!,
    },
    {
      enabled: !!organization && hasAccess && hasEntitlement,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      staleTime: 60 * 60 * 1000,
    },
  );

  if (
    usageQuery.isLoading ||
    !usageQuery.data ||
    !hasAccess ||
    !hasEntitlement
  ) {
    return null;
  }

  const usage = usageQuery.data.usageCount || 0;
  const usageType = usageQuery.data.usageType;
  const percentage = (usage / MAX_EVENTS_FREE_PLAN) * 100;

  if (percentage < 80) {
    return null;
  }

  return (
    <HoverCard>
      <HoverCardTrigger>
        <AlertTriangle
          className={cn(
            "h-4 w-4",
            percentage >= 100 ? "text-destructive" : "text-dark-yellow",
          )}
        />
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="flex justify-between space-x-4">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Free Plan Usage Limit</h4>
            <p className="text-sm font-normal">
              {`You've used ${usage.toLocaleString()} out of ${MAX_EVENTS_FREE_PLAN.toLocaleString()} included ${usageType} (${percentage.toFixed(2)}%) over the last 30 days. Please upgrade your plan to avoid interruptions.`}
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
