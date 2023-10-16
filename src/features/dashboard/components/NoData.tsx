import { Flex, Text } from "@tremor/react";

interface NoDataProps {
  noDataText?: string;
  children?: React.ReactNode;
}
export const NoData = ({ noDataText = "No data", children }: NoDataProps) => {
  return (
    <Flex
      alignItems="center"
      justifyContent="center"
      className="mt-5 min-h-[9rem] w-full rounded-tremor-default border border-dashed border-tremor-border"
    >
      <Text className="text-tremor-content">{noDataText}</Text>
      {children}
    </Flex>
  );
};
