// Langfuse Cloud only

import { Button } from "@/src/components/ui/button";
import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";
import { Card, Flex, MarkerBar, Metric, Text } from "@tremor/react";
import Link from "next/link";
import { PricingPage } from "@/src/features/pricing-page/PricingPage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import Header from "@/src/components/layouts/header";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryOrganization } from "@/src/features/organizations/utils/useOrganization";

export const OrganizationUsageChart = () => {
  const organization = useQueryOrganization();
  const usage = api.usageMetering.last30d.useQuery(
    {
      orgId: organization!.id,
    },
    {
      enabled: organization !== undefined,
    },
  );
  const capture = usePostHogClientCapture();
  const planLimit =
    organization?.cloudConfig?.monthlyObservationLimit ?? 50_000;
  const plan = organization?.cloudConfig?.plan ?? "Hobby";
  const currentMonth = new Date().toLocaleDateString("en-US", {
    month: "short",
  });

  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) return null;

  return (
    <div>
      <Header title="Usage" level="h3" />
      <Card className="p-4">
        {usage.data !== undefined && (
          <>
            <Text>Observations / month</Text>
            <Metric>{usage.data}</Metric>
            {plan === "Hobby" && (
              <>
                <Flex className="mt-4">
                  <Text>
                    {`${currentMonth}: ${usage.data} (${(
                      (usage.data / planLimit) *
                      100
                    ).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}%)`}
                  </Text>
                  <Text>Plan limit: {simplifyNumber(planLimit)}</Text>
                </Flex>
                <MarkerBar
                  value={Math.min((usage.data / planLimit) * 100, 100)}
                  className="mt-3"
                />
              </>
            )}
          </>
        )}
      </Card>
      <div className="mt-4 flex flex-row items-center gap-2">
        {plan === "Hobby" ? (
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
                  title="Select plan"
                  level="h3"
                  actionButtons={
                    <Button variant="secondary" asChild>
                      <Link href="https://langfuse.com/pricing">
                        Pricing page ↗
                      </Link>
                    </Button>
                  }
                />
              </DialogHeader>
              <PricingPage className="mb-5 mt-5" />
            </DialogContent>
          </Dialog>
        ) : (
          <Button variant="secondary">
            <Link href="https://billing.stripe.com/p/login/6oE9BXd4u8PR2aYaEE">
              Billing settings
            </Link>
          </Button>
        )}
        <div className="inline-block text-sm text-gray-500">
          Current plan: {plan}
        </div>
      </div>
    </div>
  );
};

function simplifyNumber(num: number) {
  if (num >= 1000000) return num / 1000000 + "m";
  if (num >= 1000) return num / 1000 + "k";
  return num.toString();
}
