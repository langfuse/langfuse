// Langfuse Cloud only

import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { Flex, MarkerBar, Metric, Text } from "@tremor/react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import Header from "@/src/components/layouts/header";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { Card } from "@/src/components/ui/card";
import { numberFormatter, compactNumberFormatter } from "@/src/utils/numbers";
import { useHasOrgEntitlement } from "@/src/features/entitlements/hooks";
import {
  type Plan,
  planLabels,
} from "@/src/features/entitlements/constants/plans";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeProducts";
import { useRouter } from "next/router";
import {
  chatAvailable,
  sendUserChatMessage,
} from "@/src/features/support-chat/chat";
import { env } from "@/src/env.mjs";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";

export const BillingSettings = () => {
  const router = useRouter();
  const orgId = router.query.organizationId as string | undefined;
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "langfuseCloudBilling:CRUD",
  });

  const entitled = useHasOrgEntitlement("cloud-billing");
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
    <div className="p-4">
      <Header title="Usage & Billing" level="h3" />
      <OrganizationUsageChart />
    </div>
  );
};

const OrganizationUsageChart = () => {
  const organization = useQueryOrganization();
  const usage = api.cloudBilling.getUsage.useQuery(
    {
      orgId: organization!.id,
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
  const planLimit =
    organization?.cloudConfig?.monthlyObservationLimit ?? 50_000;
  const plan: Plan = organization?.plan ?? "cloud:hobby";
  const planLabel = planLabels[plan];

  return (
    <div>
      <Card className="p-4">
        {usage.data !== undefined ? (
          <>
            <Text>
              {usage.data.billingPeriodStart
                ? `Observations since start of billing period (${usage.data.billingPeriodStart.toLocaleDateString()})`
                : "Observations / last 30d"}
            </Text>
            <Metric>{numberFormatter(usage.data.countObservations, 0)}</Metric>
            {plan === "cloud:hobby" && (
              <>
                <Flex className="mt-4">
                  <Text>{`${numberFormatter((usage.data.countObservations / planLimit) * 100)}%`}</Text>
                  <Text>Plan limit: {compactNumberFormatter(planLimit)}</Text>
                </Flex>
                <MarkerBar
                  value={Math.min(
                    (usage.data.countObservations / planLimit) * 100,
                    100,
                  )}
                  className="mt-3"
                />
              </>
            )}
          </>
        ) : (
          "Loading (might take a moment) ..."
        )}
      </Card>
      <div className="mt-4 flex flex-row items-center gap-2">
        <BillingPortalOrPricingPageButton />
        <div className="inline-block text-sm text-muted-foreground">
          Current plan: {planLabel}
        </div>
      </div>
    </div>
  );
};

const BillingPortalOrPricingPageButton = () => {
  const organization = useQueryOrganization();
  const billingPortalUrl = api.cloudBilling.getStripeCustomerPortalUrl.useQuery(
    {
      orgId: organization!.id,
    },
    {
      enabled: organization !== undefined,
    },
  );
  if (billingPortalUrl.isLoading) return null;
  if (!billingPortalUrl.data) return <PricingPageButton />;

  return (
    <Button variant="secondary" asChild>
      <Link href={billingPortalUrl.data}>Billing portal</Link>
    </Button>
  );
};

const PricingPageButton = () => {
  const capture = usePostHogClientCapture();
  const organization = useQueryOrganization();
  const router = useRouter();
  const mutCreateCheckoutSession =
    api.cloudBilling.createStripeCheckoutSession.useMutation({
      onSuccess: (url) => {
        router.push(url);
      },
    });
  if (!organization) return null;

  // Do not show checkout or customer portal if manual plan is set in cloud config
  if (organization.cloudConfig?.plan) {
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

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          capture("project_settings:pricing_dialog_opened");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">Change plan</Button>
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
              <div key={product.stripeProductId}>
                <div className="mb-2 text-lg font-semibold">
                  {product.checkout?.title}
                </div>
                <div>
                  <p>{product.checkout?.description}</p>
                  <p>{product.checkout?.price}</p>
                </div>
                <Button
                  onClick={() => {
                    mutCreateCheckoutSession.mutate({
                      orgId: organization!.id,
                      stripeProductId: product.stripeProductId,
                    });
                  }}
                  className="mt-4"
                >
                  Select plan
                </Button>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
