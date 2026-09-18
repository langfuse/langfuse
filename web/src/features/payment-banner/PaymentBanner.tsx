import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";
import { env } from "@/src/env.mjs";
import { hasOrganizationAccess } from "@/src/features/rbac";

export function usePaymentBanner() {
  const session = useSession();
  const { organization } = useQueryProjectOrOrganization();
  const isCloudBilling = useIsCloudBillingAvailable();

  const subscriptionStatus = useMemo(() => {
    // Don't show banner if:
    // - Not cloud billing environment
    // - Not authenticated
    // - No organization context
    if (
      !isCloudBilling ||
      session.status !== "authenticated" ||
      !organization
    ) {
      return null;
    }

    return organization?.cloudConfig?.stripe?.subscriptionStatus;
  }, [isCloudBilling, session.status, organization]);

  const canManageBilling = useMemo(() => {
    if (!organization) {
      return false;
    }
    return hasOrganizationAccess({
      session: session.data,
      organizationId: organization.id,
      scope: "langfuseCloudBilling:CRUD",
    });
  }, [organization, session.data]);

  const hasBillingIssue =
    subscriptionStatus === "past_due" || subscriptionStatus === "unpaid";
  const isVisible = Boolean(
    organization && hasBillingIssue && canManageBilling,
  );

  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";

  if (!isVisible || !organization) {
    return null;
  }

  return {
    organizationName: organization.name,
    billingSettingsHref: `${basePath}/organization/${organization.id}/settings/billing`,
    severity: subscriptionStatus === "unpaid" ? "critical" : "info",
  } as const;
}
