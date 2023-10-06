import { Flex, Metric, Text } from "@tremor/react";

export const TotalMetric = ({
  metric,
  description,
}: {
  metric: string;
  description?: string;
}) => {
  return (
    <Flex
      justifyContent="start"
      alignItems="baseline"
      className="space-x-2 animate-in"
    >
      <Metric>{metric}</Metric>
      <Text>{description}</Text>
    </Flex>
  );
};
