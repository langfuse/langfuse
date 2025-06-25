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
import { cn } from "@/src/utils/tailwind";
import { AlertTriangle } from "lucide-react";
import { useSidebar } from "@/src/components/ui/sidebar";

export const UsageTracker = () => {
  const { organization } = useQueryProjectOrOrganization();
  const hasEntitlement = useHasEntitlement("cloud-billing");
  const plan = usePlan();
  const hasAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "langfuseCloudBilling:CRUD",
  });
  const { setOpen } = useSidebar();

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

  const isCritical = percentage > 200;

  return (
    <>
      {/* icon when critical and sidebar is collapsed */}
      {isCritical && (
        <AlertTriangle
          className="hidden h-4 w-4 cursor-pointer self-center text-destructive group-data-[collapsible=icon]:inline-block"
          onClick={() => setOpen(true)}
        />
      )}
      {/* card when sidebar is not collapsed */}
      <Card
        className={cn(
          "relative max-h-48 overflow-hidden rounded-md bg-opacity-50 shadow-none group-data-[collapsible=icon]:hidden",
          isCritical && "border-destructive",
        )}
      >
        <CardHeader className="p-4 pb-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            {isCritical && (
              <AlertTriangle className="inline-block h-4 w-4 text-destructive" />
            )}
            Plan Usage Limit
          </CardTitle>
          <CardDescription>
            {`${usage.toLocaleString()} / ${MAX_EVENTS_FREE_PLAN.toLocaleString()} (${percentage.toFixed(0)}%) ${usageType} in last 30 days. Please upgrade your plan to avoid interruptions.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <ActionButton
            variant={isCritical ? "default" : "secondary"}
            size="sm"
            href={`/organization/${organization?.id}/settings/billing`}
            hasAccess={hasAccess}
          >
            Upgrade plan
          </ActionButton>
        </CardContent>
      </Card>
    </>
  );
};
