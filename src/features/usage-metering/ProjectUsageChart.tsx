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
import { usePostHog } from "posthog-js/react";

export const ProjectUsageChart: React.FC<{ projectId: string }> = ({
  projectId,
}) => {
  const usage = api.usageMetering.currentMonth.useQuery({
    projectId,
  });
  const posthog = usePostHog();
  const project = api.projects.byId.useQuery({ projectId });
  const planLimit =
    project.data?.cloudConfig?.monthlyObservationLimit ?? 100_000;
  const plan = project.data?.cloudConfig?.plan ?? "Hobby";
  const currentMonth = new Date().toLocaleDateString("en-US", {
    month: "short",
  });

  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) return null;

  return (
    <div>
      <h2 className="mb-5 text-base font-semibold leading-6 text-gray-900">
        Usage
      </h2>
      <Card className="p-4 lg:w-1/2">
        {usage.data !== undefined ? (
          <>
            <Text>Observations / month</Text>
            <Metric>{usage.data}</Metric>
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
        ) : null}
      </Card>
      <div className="mt-4 flex flex-row items-center gap-2">
        <Dialog
          onOpenChange={(open) => {
            if (open) {
              posthog.capture("project_settings:pricing_dialog_opened");
            }
          }}
        >
          <DialogTrigger asChild>
            <Button variant="secondary">Change plans</Button>
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
            <p>
              All plans offer a 7-day free trial. For more information about the
              plans, please visit our pricing page or reach out to us via the
              chat.
            </p>
            <PricingPage className="mb-5 mt-10 " />
          </DialogContent>
        </Dialog>
        <div className="inline-block text-sm text-gray-500">
          Currently: {plan}
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
