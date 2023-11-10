// Langfuse Cloud only

import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";
import { Card, Flex, MarkerBar, Metric, Text } from "@tremor/react";

export const ProjectUsageChart: React.FC<{ projectId: string }> = ({
  projectId,
}) => {
  const usage = api.usageMetering.currentMonth.useQuery({
    projectId,
  });
  // TODO: use planLimit from the API
  const planLimit = 100000;
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
        {usage.data ? (
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
            <MarkerBar value={usage.data / planLimit} className="mt-3" />
          </>
        ) : null}
      </Card>
    </div>
  );
};

function simplifyNumber(num: number) {
  if (num >= 1000000) return num / 1000000 + "m";
  if (num >= 1000) return num / 1000 + "k";
  return num.toString();
}
