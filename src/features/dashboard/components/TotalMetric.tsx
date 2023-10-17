import { cn } from "@/src/utils/tailwind";
import { Flex, Metric, Text } from "@tremor/react";
import { type ReactNode } from "react";

export const TotalMetric = ({
  className,
  metric,
  description,
  children,
}: {
  className?: string;
  metric: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) => {
  return (
    <Flex
      justifyContent="start"
      alignItems="baseline"
      className={cn("space-x-2 animate-in", className)}
    >
      <Metric>{metric}</Metric>
      <Text>{description}</Text>
      {children}
    </Flex>
  );
};
