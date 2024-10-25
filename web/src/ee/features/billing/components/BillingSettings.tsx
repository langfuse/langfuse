// Langfuse Cloud only

import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { Flex, MarkerBar, Metric, Text } from "@tremor/react";
import Link from "next/link";
import Header from "@/src/components/layouts/header";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { Card } from "@/src/components/ui/card";
import { numberFormatter, compactNumberFormatter } from "@/src/utils/numbers";
import { useHasOrgEntitlement } from "@/src/features/entitlements/hooks";
import { type Plan, planLabels } from "@langfuse/shared";
import { useRouter } from "next/router";
import {
  chatAvailable,
  sendUserChatMessage,
} from "@/src/features/support-chat/chat";
import { env } from "@/src/env.mjs";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { MAX_OBSERVATIONS_FREE_PLAN } from "@/src/ee/features/billing/constants";

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
  const planLimit =
    organization?.cloudConfig?.monthlyObservationLimit ??
    MAX_OBSERVATIONS_FREE_PLAN;
  const plan: Plan = organization?.plan ?? "cloud:hobby";
  const planLabel = planLabels[plan];

  return (
    <div>
      <Card className="p-3">
        {usage.data !== undefined ? (
          <>
            <Text>
              {usage.data.billingPeriod
                ? `Observations in current billing period`
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
        <BillingPortalOrCheckoutButton />
        <Button variant="secondary" asChild>
          <Link href={"https://langfuse.com/pricing"} target="_blank">
            Compare plans
          </Link>
        </Button>
      </div>
    </div>
  );
};

const BillingPortalOrCheckoutButton = () => {
  const organization = useQueryOrganization();
  const router = useRouter();
  const billingPortalUrl = api.cloudBilling.getStripeCustomerPortalUrl.useQuery(
    {
      orgId: organization?.id as string,
    },
    {
      enabled: organization !== undefined,
    },
  );

  const mutCreateCheckoutSession =
    api.cloudBilling.createStripeCheckoutSession.useMutation({
      onSuccess: (url) => {
        router.push(url);
      },
    });

  if (!organization) return null;
  if (billingPortalUrl.isLoading) return null;
  if (billingPortalUrl.data)
    return (
      <Button asChild>
        <Link href={billingPortalUrl.data}>Billing portal</Link>
      </Button>
    );

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

  // Show checkout button
  return (
    <Button
      onClick={() =>
        mutCreateCheckoutSession.mutate({
          orgId: organization.id,
          plan: "cloud:pro",
        })
      }
    >
      Upgrade to Pro plan
    </Button>
  );
};
