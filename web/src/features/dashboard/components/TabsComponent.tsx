import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import { type ReactNode, useState } from "react";

export type TabComponentProps = {
  tabs: {
    tabTitle: string;
    content: ReactNode;
  }[];
};

export const TabComponent = ({ tabs }: TabComponentProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const capture = usePostHogClientCapture();
  return (
    <div>
      <div className="sm:hidden">
        <label htmlFor="tabs" className="sr-only">
          Select a tab
        </label>
        <select
          id="tabs"
          name="tabs"
          className="border-border bg-background focus:border-primary-accent focus:ring-primary-accent block w-full rounded-md py-2 pr-10 pl-3 text-base focus:outline-hidden sm:text-sm"
          defaultValue={0}
          onChange={(e) => setSelectedIndex(Number(e.target.selectedIndex))}
        >
          {tabs.map((tab) => (
            <option key={tab.tabTitle}>{tab.tabTitle}</option>
          ))}
        </select>
      </div>
      <div className="hidden sm:block">
        <div className="border-border border-b">
          <nav
            className="-mb-px flex space-x-2 md:space-x-4 lg:space-x-6 xl:space-x-8"
            aria-label="Tabs"
          >
            {tabs.map((tab, index) => (
              <a
                key={tab.tabTitle}
                className={cn(
                  index === selectedIndex
                    ? "border-primary-accent text-primary-accent"
                    : "text-muted-foreground hover:border-border hover:text-primary border-transparent",
                  "cursor-pointer border-b-2 px-1 py-2 text-sm font-medium whitespace-nowrap",
                )}
                aria-current={index === selectedIndex ? "page" : undefined}
                onClick={() => {
                  setSelectedIndex(index);
                  capture("dashboard:chart_tab_switch", {
                    tabLabel: tab.tabTitle,
                  });
                }}
              >
                {tab.tabTitle}
              </a>
            ))}
          </nav>
        </div>
      </div>
      <div className="mt-4 flex flex-col">{tabs[selectedIndex]?.content}</div>
    </div>
  );
};
