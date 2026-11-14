import { useMemo } from "react";
import { type SessionContextValue, useSession } from "next-auth/react";

import { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";
import { env } from "@/src/env.mjs";
import {
  type MaybeSession,
  type SessionOrganization,
} from "@/src/features/auth/lib/sessionAccessors";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

export function usePaymentBanner() {
  const session = useSession();
  const { organization } = useQueryProjectOrOrganization();
  const isCloudBilling = useIsCloudBillingAvailable();

  return useMemo(
    () =>
      getSessionPaymentBanner(
        session.data,
        session.status,
        organization,
        isCloudBilling,
      ),
    [session.data, session.status, organization, isCloudBilling],
  );
}

/** getSessionPaymentBanner describes the billing-issue banner the session's user should see for organization, or null. */
function getSessionPaymentBanner(
  session: MaybeSession,
  status: SessionContextValue["status"],
  organization: SessionOrganization | null | undefined,
  isCloudBilling: boolean,
) {
  if (!isCloudBilling || status !== "authenticated" || !organization) {
    return null;
  }

  const subscriptionStatus =
    organization.cloudConfig?.stripe?.subscriptionStatus;
  if (subscriptionStatus !== "past_due" && subscriptionStatus !== "unpaid") {
    return null;
  }

  const canManageBilling = hasOrganizationAccess({
    session,
    organizationId: organization.id,
    scope: "langfuseCloudBilling:CRUD",
  });
  if (!canManageBilling) {
    return null;
  }

  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";

  return {
    organizationName: organization.name,
    billingSettingsHref: `${basePath}/organization/${organization.id}/settings/billing`,
    severity: subscriptionStatus === "unpaid" ? "critical" : "info",
  } as const;
}
