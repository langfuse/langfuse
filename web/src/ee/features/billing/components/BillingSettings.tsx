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
  DialogBody,
} from "@/src/components/ui/dialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeProducts";
import { toast } from "sonner";
import { ActionButton } from "@/src/components/ActionButton";
import { useState } from "react";
import { chatAvailable, openChat } from "@/src/features/support-chat/PlainChat";

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
      <Header title="Usage & Billing" />
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

  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);

  const mutCreateCheckoutSession =
    api.cloudBilling.createStripeCheckoutSession.useMutation({
      onSuccess: (url) => {
        router.push(url);
        setProcessingPlanId(null);
      },
      onError: () => {
        setProcessingPlanId(null);
      },
    });
  const mutChangePlan =
    api.cloudBilling.changeStripeSubscriptionProduct.useMutation({
      onSuccess: () => {
        toast.success("Plan changed successfully");
        setProcessingPlanId(null);
        // wait 1 second before reloading
        setTimeout(() => {
          window.location.reload();
        }, 500);
      },
      onError: () => {
        setProcessingPlanId(null);
      },
    });

  // Do not show checkout or customer portal if manual plan is set in cloud config
  if (organization?.cloudConfig?.plan) {
    if (chatAvailable)
      return (
        <Button
          variant="secondary"
          onClick={() =>
            // sendUserChatMessage(
            //   `I'd like to change my current plan, region ${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}, organization id ${organization.id}`,
            // )
            openChat()
          }
        >
          Change plan (via support)
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
      <DialogContent className="max-w-5xl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Plans</DialogTitle>
          <Button variant="secondary" asChild>
            <Link href="https://langfuse.com/pricing" target="_blank">
              Comparison of plans ↗
            </Link>
          </Button>
        </DialogHeader>
        <DialogBody>
          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {stripeProducts
              .filter((product) => Boolean(product.checkout))
              .map((product) => (
                <div
                  key={product.stripeProductId}
                  className="relative flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="mb-4">
                    <h3 className="text-2xl font-bold">
                      {product.checkout?.title}
                    </h3>
                    <div className="mt-4 space-y-1">
                      <div className="text-2xl font-bold text-primary">
                        {product.checkout?.price}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        + {product.checkout?.usagePrice}
                      </div>
                    </div>
                  </div>
                  <div className="mb-4 text-sm text-muted-foreground">
                    {product.checkout?.description}
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Main features:</div>
                    <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                      {product.checkout?.mainFeatures.map((feature, index) => (
                        <li key={index}>{feature}</li>
                      ))}
                    </ul>
                  </div>
                  <Link
                    href="https://langfuse.com/pricing"
                    target="_blank"
                    className="mt-auto block py-4 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Learn more about plan →
                  </Link>
                  {organization?.cloudConfig?.stripe?.activeProductId ? (
                    // Change plan
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          disabled={
                            organization?.cloudConfig?.stripe
                              ?.activeProductId === product.stripeProductId
                          }
                          className="w-full"
                        >
                          {organization?.cloudConfig?.stripe
                            ?.activeProductId === product.stripeProductId
                            ? "Current plan"
                            : "Change plan"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>
                            Confirm Change:{" "}
                            {planLabels[organization?.plan ?? "cloud:hobby"]} →{" "}
                            {product.checkout?.title}
                          </DialogTitle>
                          <DialogDescription className="pt-2">
                            This will immediately generate an invoice for any
                            usage on your current plan. Your new plan and
                            billing period will start today. Are you sure you
                            want to continue?
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="secondary">Cancel</Button>
                          </DialogClose>
                          <ActionButton
                            onClick={() => {
                              if (organization) {
                                setProcessingPlanId(product.stripeProductId);
                                mutChangePlan.mutate({
                                  orgId: organization.id,
                                  stripeProductId: product.stripeProductId,
                                });
                              }
                            }}
                            loading={
                              processingPlanId === product.stripeProductId
                            }
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
                        if (organization) {
                          setProcessingPlanId(product.stripeProductId);
                          mutCreateCheckoutSession.mutate({
                            orgId: organization.id,
                            stripeProductId: product.stripeProductId,
                          });
                        }
                      }}
                      disabled={
                        organization?.cloudConfig?.stripe?.activeProductId ===
                        product.stripeProductId
                      }
                      className="w-full"
                      loading={processingPlanId === product.stripeProductId}
                    >
                      Select plan
                    </ActionButton>
                  )}
                </div>
              ))}
          </div>
        </DialogBody>
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
