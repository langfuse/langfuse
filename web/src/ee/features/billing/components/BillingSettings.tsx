// Langfuse Cloud only

import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { Flex, MarkerBar, Metric, Text } from "@tremor/react";
import Link from "next/link";
import Header from "@/src/components/layouts/header";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { Card } from "@/src/components/ui/card";
import { numberFormatter, compactNumberFormatter } from "@/src/utils/numbers";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { type Plan, planLabels } from "@langfuse/shared";
import { useRouter } from "next/router";
import {
  chatAvailable,
  sendUserChatMessage,
} from "@/src/features/support-chat/chat";
import { env } from "@/src/env.mjs";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { MAX_EVENTS_FREE_PLAN } from "@/src/ee/features/billing/constants";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeProducts";
import { toast } from "sonner";
import { ActionButton } from "@/src/components/ActionButton";

export const BillingSettings = () => {
  const router = useRouter();
  const orgId = router.query.organizationId as string | undefined;
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "langfuseCloudBilling:CRUD",
  });

  const entitled = useHasEntitlement("cloud-billing");
  if (!entitled) return null;

  if (!hasAccess)
    return (
      <Alert>
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          You do not have permission to view the billing settings of this
          organization.
        </AlertDescription>
      </Alert>
    );
  return (
    <div>
      <Header title="Usage & Billing" level="h3" />
      <OrganizationUsageChart />
    </div>
  );
};

const OrganizationUsageChart = () => {
  const organization = useQueryOrganization();
  const usage = api.cloudBilling.getUsage.useQuery(
    {
      orgId: organization?.id as string,
    },
    {
      enabled: organization !== undefined,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );
  const hobbyPlanLimit =
    organization?.cloudConfig?.monthlyObservationLimit ?? MAX_EVENTS_FREE_PLAN;
  const plan: Plan = organization?.plan ?? "cloud:hobby";
  const planLabel = planLabels[plan];
  const usageType = usage.data?.usageType
    ? usage.data.usageType.charAt(0).toUpperCase() +
      usage.data.usageType.slice(1)
    : "Events";

  return (
    <div>
      <Card className="p-3">
        {usage.data !== undefined ? (
          <>
            <Text>
              {usage.data.billingPeriod
                ? `${usageType} in current billing period`
                : `${usageType} / last 30d`}
            </Text>
            <Metric>{numberFormatter(usage.data.usageCount, 0)}</Metric>
            {plan === "cloud:hobby" && (
              <>
                <Flex className="mt-4">
                  <Text>{`${numberFormatter((usage.data.usageCount / hobbyPlanLimit) * 100)}%`}</Text>
                  <Text>
                    Plan limit: {compactNumberFormatter(hobbyPlanLimit)}
                  </Text>
                </Flex>
                <MarkerBar
                  value={Math.min(
                    (usage.data.usageCount / hobbyPlanLimit) * 100,
                    100,
                  )}
                  className="mt-3"
                />
              </>
            )}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            Loading (might take a moment) ...
          </span>
        )}
      </Card>
      <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
        <p>Current plan: {planLabel}</p>
        {usage.data?.billingPeriod && (
          <p>
            {`Billing period: ${usage.data.billingPeriod.start.toLocaleDateString()} - ${usage.data.billingPeriod.end.toLocaleDateString()}`}
          </p>
        )}
        {usage.data?.upcomingInvoice && (
          <p>
            {`Next invoice (current usage): ${usage.data.upcomingInvoice.usdAmount} USD`}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-row items-center gap-2">
        <BillingPortalOrPricingPageButton />
        <Button variant="secondary" asChild>
          <Link href={"https://langfuse.com/pricing"} target="_blank">
            Compare plans
          </Link>
        </Button>
      </div>
    </div>
  );
};

const BillingPortalOrPricingPageButton = () => {
  const organization = useQueryOrganization();
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const billingPortalUrl = api.cloudBilling.getStripeCustomerPortalUrl.useQuery(
    {
      orgId: organization?.id as string,
    },
    {
      enabled: organization !== undefined,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    },
  );

  const mutCreateCheckoutSession =
    api.cloudBilling.createStripeCheckoutSession.useMutation({
      onSuccess: (url) => {
        router.push(url);
      },
    });
  const mutChangePlan =
    api.cloudBilling.changeStripeSubscriptionProduct.useMutation({
      onSuccess: () => {
        toast.success("Plan changed successfully");
        // wait 1 second before reloading
        setTimeout(() => {
          window.location.reload();
        }, 500);
      },
    });

  // Do not show checkout or customer portal if manual plan is set in cloud config
  if (organization?.cloudConfig?.plan) {
    if (chatAvailable)
      return (
        <Button
          variant="secondary"
          onClick={() =>
            sendUserChatMessage(
              `I'd like to change my current plan, region ${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}, organization id ${organization.id}`,
            )
          }
        >
          Change plan
        </Button>
      );
    else return null;
  }

  const switchPlan = (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          capture("project_settings:pricing_dialog_opened");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>Change plan</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <Header
            title="Plans"
            level="h3"
            actionButtons={
              <Button variant="secondary" asChild>
                <Link href="https://langfuse.com/pricing" target="_blank">
                  Comparison of plans ↗
                </Link>
              </Button>
            }
          />
        </DialogHeader>
        <div className="mb-3 flex flex-col justify-center gap-10 md:flex-row">
          {stripeProducts
            .filter((product) => Boolean(product.checkout))
            .map((product) => (
              <div
                key={product.stripeProductId}
                className="flex flex-1 flex-col"
              >
                <div className="mb-2 text-lg font-semibold">
                  {product.checkout?.title}
                </div>
                <div>{product.checkout?.description}</div>
                <div className="mb-6 mt-2">{product.checkout?.price}</div>
                {organization?.cloudConfig?.stripe?.activeProductId ? (
                  // Change plan
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        disabled={
                          organization?.cloudConfig?.stripe?.activeProductId ===
                          product.stripeProductId
                        }
                        className="mt-auto"
                      >
                        {organization?.cloudConfig?.stripe?.activeProductId ===
                        product.stripeProductId
                          ? "Current plan"
                          : "Change plan"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Confirm Plan Change</DialogTitle>
                        <DialogDescription>
                          Changing your plan will immediately generate an
                          invoice for any usage on your current plan. Your new
                          plan and billing period will start today. Are you sure
                          you want to continue?
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="secondary">Cancel</Button>
                        </DialogClose>
                        <ActionButton
                          onClick={() => {
                            if (organization) {
                              mutChangePlan.mutate({
                                orgId: organization.id,
                                stripeProductId: product.stripeProductId,
                              });
                            }
                          }}
                          loading={mutChangePlan.isLoading}
                        >
                          Confirm
                        </ActionButton>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : (
                  // Upgrade, no plan yet
                  <ActionButton
                    onClick={() => {
                      if (organization)
                        mutCreateCheckoutSession.mutate({
                          orgId: organization.id,
                          stripeProductId: product.stripeProductId,
                        });
                    }}
                    disabled={
                      organization?.cloudConfig?.stripe?.activeProductId ===
                      product.stripeProductId
                    }
                    className="mt-auto"
                    loading={mutCreateCheckoutSession.isLoading}
                  >
                    Select plan
                  </ActionButton>
                )}
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );

  // Show pricing page button
  return (
    <>
      {switchPlan}
      {billingPortalUrl.data && (
        <Button asChild>
          <Link href={billingPortalUrl.data}>Billing portal</Link>
        </Button>
      )}
    </>
  );
};
