import { Flex, Text } from "@tremor/react";

interface NoDataProps {
  noDataText?: string;
}
export const NoData = ({ noDataText = "No data" }: NoDataProps) => {
  return (
    <Flex
      alignItems="center"
      justifyContent="center"
      className="mt-5 w-full rounded-tremor-default border border-dashed border-tremor-border"
    >
      <Text className="text-tremor-content">{noDataText}</Text>
    </Flex>
  );
};
