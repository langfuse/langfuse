import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
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
    // Fills the card's flex column so tab content (charts) can absorb extra
    // tile height on dashboards and a height-aware child can measure it.
    // -mx-4 bleeds through DashboardCard's p-4 so the divider spans the card.
    <div className="-mx-4 flex min-h-0 grow flex-col">
      <Tabs
        layout="fill"
        value={String(selectedIndex)}
        onValueChange={(value) => {
          const index = Number(value);
          setSelectedIndex(index);
          capture("dashboard:chart_tab_switch", {
            tabLabel: tabs[index]?.tabTitle,
          });
        }}
      >
        <div className="px-4 sm:hidden">
          <label htmlFor="tabs" className="sr-only">
            Select a tab
          </label>
          <select
            id="tabs"
            name="tabs"
            className="border-border bg-background focus:border-primary-accent focus:ring-primary-accent block w-full rounded-md py-2 pr-10 pl-3 text-base focus:outline-hidden sm:text-sm"
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(Number(e.target.value))}
          >
            {tabs.map((tab, index) => (
              <option key={tab.tabTitle} value={index}>
                {tab.tabTitle}
              </option>
            ))}
          </select>
        </div>
        {/* Scrolls instead of clipping tabs that do not fit the card. */}
        <div className="hidden overflow-x-auto sm:block [&>[role=tablist]]:min-w-max">
          <Tabs.List variant="underline" aria-label="Tabs">
            {tabs.map((tab, index) => (
              <Tabs.Trigger
                key={tab.tabTitle}
                value={String(index)}
                label={tab.tabTitle}
              />
            ))}
          </Tabs.List>
        </div>
        {tabs.map((tab, index) => (
          <Tabs.Content key={tab.tabTitle} value={String(index)} layout="fill">
            <div className="mt-4 flex min-h-0 grow flex-col px-4">
              {tab.content}
            </div>
          </Tabs.Content>
        ))}
      </Tabs>
    </div>
  );
};
