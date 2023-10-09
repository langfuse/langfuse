import { cn } from "@/src/utils/tailwind";
import { Flex, Metric, Text } from "@tremor/react";
import { type ReactNode } from "react";

export const TotalMetric = ({
  className,
  metric,
  description,
}: {
  className?: string;
  metric: ReactNode;
  description?: ReactNode;
}) => {
  return (
    <Flex
      justifyContent="start"
      alignItems="baseline"
      className={cn("space-x-2 animate-in", className)}
    >
      <Metric>{metric}</Metric>
      <Text>{description}</Text>
    </Flex>
  );
};
