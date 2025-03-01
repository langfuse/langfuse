import { api } from "@/src/utils/api";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { MAX_EVENTS_FREE_PLAN } from "@/src/ee/features/billing/constants";
import { useHasEntitlement, usePlan } from "@/src/features/entitlements/hooks";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { ActionButton } from "@/src/components/ActionButton";

export const UsageTracker = () => {
  const { organization } = useQueryProjectOrOrganization();
  const hasEntitlement = useHasEntitlement("cloud-billing");
  const plan = usePlan();
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
    !hasEntitlement ||
    plan !== "cloud:hobby"
  ) {
    return null;
  }

  const usage = usageQuery.data.usageCount || 0;
  const usageType = usageQuery.data.usageType;
  const percentage = (usage / MAX_EVENTS_FREE_PLAN) * 100;

  if (percentage < 90) {
    return null;
  }

  return (
    <Card className="relative max-h-48 overflow-hidden rounded-md bg-opacity-50 shadow-none group-data-[collapsible=icon]:hidden">
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-sm">Hobby Plan Usage Limit</CardTitle>
        <CardDescription>
          {`${usage.toLocaleString()} / ${MAX_EVENTS_FREE_PLAN.toLocaleString()} (${percentage.toFixed(0)}%) ${usageType} in last 30 days. Please upgrade your plan to avoid interruptions.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <ActionButton
          variant="secondary"
          size="sm"
          href={`/organization/${organization?.id}/settings/billing`}
          hasAccess={hasAccess}
        >
          Upgrade plan
        </ActionButton>
      </CardContent>
    </Card>
  );
};
