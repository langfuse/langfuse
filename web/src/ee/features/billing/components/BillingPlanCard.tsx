// Langfuse Cloud only
import { type ComponentProps, type ReactNode } from "react";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import {
  formatBillingDate,
  formatBillingDay,
  formatBillingPeriod,
} from "@/src/ee/features/billing/utils/formatBillingDate";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeCatalogue";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";

import { BillingDiscountView } from "./BillingDiscountView";
import { BillingQuietLink } from "./BillingQuietLink";
import { PlanPickerDialogController } from "./PlanPickerDialogController";
import { StripeCancellationButton } from "./StripeCancellationButton";
import { StripeCustomerPortalButton } from "./StripeCustomerPortalButton";
import { useBillingInformation } from "./useBillingInformation";

const PRICING_URL = "https://langfuse.com/pricing";
const topPlanOrderKey = Math.max(
  ...stripeProducts.map((product) => product.orderKey ?? 0),
);

type Billing = ReturnType<typeof useBillingInformation>;
type PlanStatus = {
  label: string;
  color: ComponentProps<typeof Badge>["color"];
};

/** A plan name or date inside muted text, dark enough to be found at a glance. */
function Key({ children }: { children: ReactNode }) {
  return <span className="text-foreground font-medium">{children}</span>;
}

function statusLine(billing: Billing): ReactNode {
  if (billing.cancellation?.date) {
    return (
      <>
        Ends <Key>{formatBillingDate(billing.cancellation.date)}</Key>, then{" "}
        <Key>Hobby</Key>
      </>
    );
  }
  if (billing.scheduledPlanSwitch?.date) {
    return (
      <>
        Switches to{" "}
        <Key>{billing.scheduledPlanSwitch.newPlanLabel ?? "a new plan"}</Key> on{" "}
        <Key>{formatBillingDate(billing.scheduledPlanSwitch.date)}</Key>
      </>
    );
  }
  if (billing.hasActiveSubscription && billing.billingPeriod) {
    return (
      <>
        Renews <Key>{formatBillingDate(billing.billingPeriod.end)}</Key>
      </>
    );
  }
  return null;
}

/** The badge beside the plan name; a plan set by the Langfuse team has none. */
function planStatus(billing: Billing): PlanStatus {
  if (billing.organization?.plan === "cloud:enterprise-trial") {
    return { label: "Trial", color: "info" };
  }
  if (!billing.hasActiveSubscription) return { label: "Free", color: "filled" };
  if (!billing.hasValidPaymentMethod && !billing.isLoading) {
    return { label: "Payment needed", color: "error" };
  }
  if (billing.cancellation?.date) {
    return {
      label: `Ends ${formatBillingDay(billing.cancellation.date)}`,
      color: "warning",
    };
  }
  if (billing.scheduledPlanSwitch?.date) {
    return {
      label: `Switches ${formatBillingDay(billing.scheduledPlanSwitch.date)}`,
      color: "warning",
    };
  }
  return { label: "Active", color: "success" };
}

/** A labelled fact in the card's second row; the cells sit side by side and stack on narrow cards. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5 px-4 py-2.5">
      <div className="text-muted-foreground text-xs">{label}</div>
      {children}
    </div>
  );
}

export function BillingPlanCard({ showDiscount }: { showDiscount: boolean }) {
  const billing = useBillingInformation();
  const {
    organization,
    planLabel,
    cancellation,
    billingPeriod,
    currentProductId,
    hasActiveSubscription,
    hasValidPaymentMethod,
    isLoading,
  } = billing;
  const hasBillingAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "langfuseCloudBilling:CRUD",
  });
  const { setOpen: setSupportOpen } = useSupportDrawer();
  const { setOpen: setMigrationPanelOpen } = useV4MigrationPanel();

  const capture = usePostHogClientCapture();
  const openSupport = (source: "footer_link" | "manual_plan_button") => {
    setMigrationPanelOpen(false);
    setSupportOpen(true);
    capture("billing_page:contact_support_clicked", {
      plan: organization?.plan ?? null,
      billingProvider: billing.billingProvider,
      source,
    });
  };

  const product = stripeProducts.find(
    (candidate) => candidate.stripeProductId === currentProductId,
  );
  const isManualPlan = Boolean(organization?.cloudConfig?.plan);
  const isTopPlan = (product?.orderKey ?? 0) >= topPlanOrderKey;
  const isPlanChangeDisabled = hasActiveSubscription && !hasValidPaymentMethod;
  const status = isManualPlan ? null : planStatus(billing);
  const line = isManualPlan ? null : statusLine(billing);
  const price = isManualPlan ? null : product?.checkout?.price;
  const canManageSubscription =
    !isManualPlan && Boolean(organization) && hasActiveSubscription;
  const isCancelScheduled = Boolean(cancellation);
  const hasInvalidPaymentMethod =
    canManageSubscription && !hasValidPaymentMethod && !isLoading;
  const hasPaymentCell =
    canManageSubscription && hasBillingAccess && Boolean(organization);
  const hasDiscountCell = showDiscount && Boolean(organization);
  // The renewal line already names the date a paid period ends on; a free plan's period is when its limit resets.
  const hasPeriodCell = !canManageSubscription && Boolean(billingPeriod);

  return (
    <Card className="flex flex-col divide-y">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-4 py-3.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl leading-tight font-bold">{planLabel}</h3>
            {status ? <Badge color={status.color} text={status.label} /> : null}
          </div>
          {price || line ? (
            <p className="text-muted-foreground text-sm">
              {price}
              {price && line ? ". " : null}
              {line}
            </p>
          ) : null}
          {hasInvalidPaymentMethod ? (
            <p className="text-sm text-red-600">
              You do not have a valid payment method. Please Update Billing
              Details.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {!isManualPlan && isCancelScheduled ? (
            <PlanPickerDialogController isDisabled={isPlanChangeDisabled}>
              {({ openDialog }) => (
                <Button
                  variant="ghost"
                  disabled={isPlanChangeDisabled}
                  onClick={openDialog}
                >
                  Change plan
                </Button>
              )}
            </PlanPickerDialogController>
          ) : null}
          {isManualPlan ? (
            <Button
              variant="secondary"
              onClick={() => openSupport("manual_plan_button")}
            >
              Change plan (via support)
            </Button>
          ) : null}
          {canManageSubscription && isCancelScheduled && organization ? (
            <StripeCancellationButton
              orgId={organization.id}
              variant="default"
            />
          ) : null}
          {!isManualPlan && !isCancelScheduled && isTopPlan ? (
            <PlanPickerDialogController isDisabled={isPlanChangeDisabled}>
              {({ openDialog }) => (
                <Button
                  variant="secondary"
                  disabled={isPlanChangeDisabled}
                  onClick={openDialog}
                >
                  Change plan
                </Button>
              )}
            </PlanPickerDialogController>
          ) : null}
          {!isManualPlan && !isCancelScheduled && !isTopPlan ? (
            <PlanPickerDialogController isDisabled={isPlanChangeDisabled}>
              {({ openDialog }) => (
                <Button disabled={isPlanChangeDisabled} onClick={openDialog}>
                  Upgrade plan
                </Button>
              )}
            </PlanPickerDialogController>
          ) : null}
        </div>
      </div>

      {hasPeriodCell || hasPaymentCell || hasDiscountCell ? (
        <div className="flex flex-wrap divide-x">
          {hasPeriodCell && billingPeriod ? (
            <Cell label="Billing period">
              <p className="text-sm">
                {formatBillingPeriod(billingPeriod.start, billingPeriod.end)}
              </p>
            </Cell>
          ) : null}
          {hasPaymentCell && organization ? (
            <Cell label="Payment and invoices">
              <div>
                <StripeCustomerPortalButton
                  orgId={organization.id}
                  title="Update billing details"
                  variant="inline-link"
                />
              </div>
            </Cell>
          ) : null}
          {hasDiscountCell && organization ? (
            <Cell label="Discount">
              <BillingDiscountView
                orgId={organization.id}
                hasStripeCustomer={Boolean(
                  organization.cloudConfig?.stripe?.customerId,
                )}
              />
            </Cell>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <BillingQuietLink label="Compare plans" href={PRICING_URL} />
          {isManualPlan ? null : (
            <BillingQuietLink
              label="Contact support"
              onClick={() => openSupport("footer_link")}
            />
          )}
        </div>
        {canManageSubscription && !isCancelScheduled && organization ? (
          <StripeCancellationButton
            orgId={organization.id}
            variant="quiet-link"
          />
        ) : null}
      </div>
    </Card>
  );
}
