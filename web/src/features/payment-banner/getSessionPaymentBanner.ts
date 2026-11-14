import { env } from "@/src/env.mjs";
import {
  type MaybeSession,
  type SessionOrganization,
  type SessionStatus,
} from "@/src/features/rbac/new/sessionAccessors";
import { hasOrganizationAccess } from "@/src/features/rbac/new/checkOrganizationAccess";

/** getSessionPaymentBanner describes the billing-issue banner for organization, or null unless the session's user can manage its past-due or unpaid cloud subscription. */
export function getSessionPaymentBanner(
  session: MaybeSession,
  status: SessionStatus,
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
    severity: paymentBannerSeverity(subscriptionStatus),
  } as const;
}

/** paymentBannerSeverity escalates an unpaid subscription above a past-due one. */
function paymentBannerSeverity(subscriptionStatus: "past_due" | "unpaid") {
  if (subscriptionStatus === "unpaid") return "critical";
  return "info";
}
