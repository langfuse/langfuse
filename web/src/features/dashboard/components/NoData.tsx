import { cn } from "@/src/utils/tailwind";
import { Flex, Text } from "@tremor/react";

interface NoDataProps {
  noDataText?: string;
  children?: React.ReactNode;
  className?: string;
}
export const NoData = ({
  noDataText = "No data",
  children,
  className,
}: NoDataProps) => {
  return (
    <Flex
      alignItems="center"
      justifyContent="center"
      className={cn(
        className,
        "min-h-[9rem] w-full flex-1 rounded-tremor-default border border-dashed",
      )}
    >
      <Text className="text-tremor-content">{noDataText}</Text>
      {children}
    </Flex>
  );
};
