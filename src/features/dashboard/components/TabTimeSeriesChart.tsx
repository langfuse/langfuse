import {
  BaseTimeSeriesChart,
  type TimeSeriesChartDataPoint,
} from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseries-aggregation";
import { Tab, TabList, TabGroup, TabPanel, TabPanels } from "@tremor/react";

import { type ReactNode, useState } from "react";

export type BaseTabTimeseriesChartProps = {
  agg: DateTimeAggregationOption;
  showLegend?: boolean;
  connectNulls?: boolean;
  data: {
    totalMetric: ReactNode;
    metricDescription: ReactNode;
    tabTitle: string;
    formatter?: (value: number) => string;
    data: TimeSeriesChartDataPoint[];
  }[];
};

export const BaseTabTimeseriesChart = (props: BaseTabTimeseriesChartProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <div className="flex flex-col justify-between">
      <TotalMetric
        metric={props.data[selectedIndex]?.totalMetric}
        description={props.data[selectedIndex]?.metricDescription}
      />
      <TabGroup
        className="mt-4"
        index={selectedIndex}
        onIndexChange={(i) => setSelectedIndex(i)}
        defaultIndex={0}
      >
        <TabList className="h-10">
          {props.data.map((data, index) => (
            <Tab tabIndex={index} key={index}>
              {data.tabTitle}
            </Tab>
          ))}
        </TabList>
        <TabPanels>
          {props.data.map((data, index) => (
            <TabPanel key={index}>
              <BaseTimeSeriesChart
                agg={props.agg}
                data={data.data}
                showLegend={true}
                valueFormatter={data.formatter}
              />
            </TabPanel>
          ))}
        </TabPanels>
      </TabGroup>
    </div>
  );
};
