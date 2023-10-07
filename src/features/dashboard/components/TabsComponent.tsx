import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { cn } from "@/src/utils/tailwind";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@tremor/react";
import { type ReactNode, useState } from "react";

export type TabComponentProps = {
  tabs: {
    tabTitle: string;
    content: ReactNode;
    totalMetric: string;
    metricDescription: string;
  }[];
};

export const TabComponent = ({ tabs }: TabComponentProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // <div className="flex flex-col justify-between">
  //   <TotalMetric
  //     metric={props.data[selectedIndex]?.totalMetric}
  //     description={props.data[selectedIndex]?.metricDescription}
  //   />
  //   <TabGroup
  //     className="mt-4"
  //     index={selectedIndex}
  //     onIndexChange={(i) => setSelectedIndex(i)}
  //     defaultIndex={0}
  //   >
  //     <TabList className="h-10" color="orange">
  //       {props.data.map((data, index) => (
  //         <Tab key={index}>{data.tabTitle}</Tab>
  //       ))}
  //     </TabList>
  //     <TabPanels>
  //       {props.data.map((data, index) => (
  //         <TabPanel key={index}>{data.content}</TabPanel>
  //       ))}
  //     </TabPanels>
  //   </TabGroup>
  // </div>
  return (
    <div>
      <div className="sm:hidden">
        <label htmlFor="tabs" className="sr-only">
          Select a tab
        </label>
        <select
          id="tabs"
          name="tabs"
          className="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          defaultValue={0}
        >
          {tabs.map((tab) => (
            <option key={tab.tabTitle}>{tab.tabTitle}</option>
          ))}
        </select>
      </div>
      <div className="hidden sm:block">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {tabs.map((tab, index) => (
              <a
                key={tab.tabTitle}
                className={cn(
                  index === selectedIndex
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
                  "whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium",
                )}
                aria-current={index === selectedIndex ? "page" : undefined}
                onClick={() => setSelectedIndex(index)}
              >
                {tab.tabTitle}
              </a>
            ))}
          </nav>
        </div>
      </div>
      <div className="mt-6">{tabs[selectedIndex]?.content}</div>
    </div>
  );
};
