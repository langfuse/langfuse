import { Card, Metric, Text, Title, BarList, Flex } from "@tremor/react";
import { Loader } from "lucide-react";

type BarChartDataPoint = {
  name: string;
  value: number;
};

interface BarChartCardProps {
  isLoading: boolean;
  header: {
    metric: string;
    stat: number;
    category: string;
  };
  chart: {
    data: BarChartDataPoint[];
    header: string;
    metric: string;
  };
}

export default function BarChartCard({
  header,
  chart,
  isLoading,
}: BarChartCardProps) {
  return (
    <Card>
      <Title>{header.category}</Title>
      {isLoading ? (
        <div className="absolute right-5 top-5 ">
          <Loader className="h-5 w-5 animate-spin" />
        </div>
      ) : null}
      <Flex justifyContent="start" alignItems="baseline" className="space-x-2">
        <Metric>{header.stat}</Metric>
        <Text>{header.metric}</Text>
      </Flex>
      <Flex className="mt-6">
        <Text>{chart.header}</Text>
        <Text className="text-right">{chart.metric}</Text>
      </Flex>
      <BarList
        data={chart.data}
        valueFormatter={(number: number) =>
          Intl.NumberFormat("us").format(number).toString()
        }
        className="mt-2 h-64"
        color={"indigo"}
        showAnimation={true}
      />
    </Card>
  );
}
