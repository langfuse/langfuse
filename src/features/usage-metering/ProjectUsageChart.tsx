// Langfuse Cloud only

import { Button } from "@/src/components/ui/button";
import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";
import { Card, Flex, MarkerBar, Metric, Text } from "@tremor/react";
import {
  chatAvailable,
  sendUserChatMessage,
  showAgentChatMessage,
} from "@/src/features/support-chat/chat";

export const ProjectUsageChart: React.FC<{ projectId: string }> = ({
  projectId,
}) => {
  const usage = api.usageMetering.currentMonth.useQuery({
    projectId,
  });
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
      {chatAvailable && (
        <>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => {
              sendUserChatMessage(
                "I want to change my plan, project: " + projectId,
              );
              // wait for 2 seconds
              setTimeout(() => {
                showAgentChatMessage(
                  "We're happy to help. Which plan would you like to change to? See https://langfuse.com/#pricing for details on available plans.",
                );
              }, 2000);
            }}
          >
            Change plan
          </Button>
          <span className="ml-2 text-gray-500">Currently: {plan}</span>
        </>
      )}
    </div>
  );
};

function simplifyNumber(num: number) {
  if (num >= 1000000) return num / 1000000 + "m";
  if (num >= 1000) return num / 1000 + "k";
  return num.toString();
}
