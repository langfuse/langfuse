/* eslint-disable @repo/no-null-render */
import { useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";
import { useTopBannerRegistration } from "@/src/features/top-banner";
import { env } from "@/src/env.mjs";
import { hasOrganizationAccess } from "@/src/features/rbac";
import { PaymentBannerView } from "./PaymentBannerView";

const PAYMENT_BANNER_ID = "payment-banner";
const PAYMENT_BANNER_ORDER = 10;

export function PaymentBanner() {
  const session = useSession();
  const { organization } = useQueryProjectOrOrganization();
  const isCloudBilling = useIsCloudBillingAvailable();
  const bannerRef = useRef<HTMLDivElement>(null);

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

  useTopBannerRegistration({
    bannerId: PAYMENT_BANNER_ID,
    order: PAYMENT_BANNER_ORDER,
    isVisible,
    elementRef: bannerRef,
  });

  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";

  if (!isVisible || !organization) {
    return null;
  }

  return (
    <PaymentBannerView
      ref={bannerRef}
      organizationName={organization.name}
      billingSettingsHref={`${basePath}/organization/${organization.id}/settings/billing`}
      severity={subscriptionStatus === "unpaid" ? "critical" : "info"}
    />
  );
}
