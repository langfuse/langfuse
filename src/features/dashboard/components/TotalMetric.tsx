import { Flex, Metric, Text } from "@tremor/react";
import { type ReactNode } from "react";

export const TotalMetric = ({
  metric,
  description,
}: {
  metric: ReactNode;
  description?: ReactNode;
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
