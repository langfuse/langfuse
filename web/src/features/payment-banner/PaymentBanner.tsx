import { useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { AlertCircle, CreditCard } from "lucide-react";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";
import { useTopBannerRegistration } from "@/src/features/top-banner";
import { cn } from "@/src/utils/tailwind";
import { env } from "@/src/env.mjs";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { cva } from "class-variance-authority";

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

  // Determine severity styling
  const isCritical = subscriptionStatus === "unpaid";
  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";

  const drawerVariants = cva(
    "fixed top-0 z-[51] flex w-full items-center justify-between gap-4 px-4 py-1 sm:px-4 lg:px-4",
    {
      variants: {
        type: {
          info: "bg-foreground text-background",
          warning:
            "bg-amber-500 text-amber-950 dark:bg-amber-600 dark:text-amber-50",
          critical: "bg-destructive text-destructive-foreground",
        },

        defaultVariants: {
          type: "info",
        },
      },
    },
  );

  if (!isVisible || !organization) {
    return null;
  }

  return (
    <div
      ref={bannerRef}
      className={cn(drawerVariants({ type: isCritical ? "critical" : "info" }))}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
          <span className="text-sm font-semibold">Billing Issue:</span>
          <span className="text-sm">
            {`We have problems collecting subscription payment for your organization '${organization.name}'. Please update your payment information to continue using Langfuse.`}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link
            href={`${basePath}/organization/${organization.id}/settings/billing`}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Update Payment
          </Link>
        </Button>
      </div>
    </div>
  );
}
