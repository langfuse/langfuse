import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@tremor/react";
import { type ReactNode, useState } from "react";

export type TabComponentProps = {
  data: {
    tabTitle: string;
    content: ReactNode;
    totalMetric: string;
    metricDescription: string;
  }[];
};

export const TabComponent = (props: TabComponentProps) => {
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
            <TabPanel key={index}>{data.content}</TabPanel>
          ))}
        </TabPanels>
      </TabGroup>
    </div>
  );
};
