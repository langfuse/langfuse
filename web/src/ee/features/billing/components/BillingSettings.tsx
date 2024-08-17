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

export const BillingSettings = () => {
  return (
    <div className="p-4">
      <Header title="Usage & Billing" level="h3" />
      <OrganizationUsageChart />
    </div>
  );
};

const OrganizationUsageChart = () => {
  const organization = useQueryOrganization();
  const entitled = useHasOrgEntitlement("cloud-billing");
  const usage = api.cloudBilling.last30dUsage.useQuery(
    {
      orgId: organization!.id,
    },
    {
      enabled: organization !== undefined && entitled,
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

  if (!entitled) return null;

  return (
    <div>
      <Card className="p-4">
        {usage.data !== undefined ? (
          <>
            <Text>Observations / last 30d</Text>
            <Metric>{numberFormatter(usage.data, 0)}</Metric>
            {plan === "cloud:hobby" && (
              <>
                <Flex className="mt-4">
                  <Text>{`${numberFormatter((usage.data / planLimit) * 100)}%`}</Text>
                  <Text>Plan limit: {compactNumberFormatter(planLimit)}</Text>
                </Flex>
                <MarkerBar
                  value={Math.min((usage.data / planLimit) * 100, 100)}
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
        {organization?.cloudConfig?.stripe?.activeSubscriptionId ? (
          <BillingPortalButton />
        ) : (
          <PricingPageButton />
        )}
        <div className="inline-block text-sm text-muted-foreground">
          Current plan: {planLabel}
        </div>
      </div>
    </div>
  );
};

const PricingPageButton = () => {
  const capture = usePostHogClientCapture();
  const organization = useQueryOrganization();
  const router = useRouter();
  const mutCreateCheckoutSession =
    api.cloudBilling.createStripeCheckoutSession.useMutation();
  if (!organization) return null;
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
                    mutCreateCheckoutSession
                      .mutateAsync({
                        orgId: organization!.id,
                        stripeProductId: product.stripeProductId,
                      })
                      .then((url) => {
                        router.push(url);
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

const BillingPortalButton = () => {
  const organization = useQueryOrganization();
  const billingPortalUrl = api.cloudBilling.getStripeCustomerPortalUrl.useQuery(
    {
      orgId: organization!.id,
    },
    {
      enabled: organization !== undefined,
    },
  );
  if (!billingPortalUrl.data) return null;

  return (
    <Button variant="secondary" asChild>
      <Link href={billingPortalUrl.data}>Billing portal</Link>
    </Button>
  );
};
