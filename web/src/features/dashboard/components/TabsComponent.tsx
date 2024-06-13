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
          className="block w-full rounded-md border-border bg-background py-2 pl-3 pr-10 text-base focus:border-primary-accent focus:outline-none focus:ring-primary-accent sm:text-sm"
          defaultValue={0}
          onChange={(e) => setSelectedIndex(Number(e.target.selectedIndex))}
        >
          {tabs.map((tab) => (
            <option key={tab.tabTitle}>{tab.tabTitle}</option>
          ))}
        </select>
      </div>
      <div className="hidden sm:block">
        <div className="border-b border-border">
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
                    : "border-transparent text-muted-foreground hover:border-border hover:text-primary",
                  "cursor-pointer whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium",
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
      <div className="mt-6">{tabs[selectedIndex]?.content}</div>
    </div>
  );
};
