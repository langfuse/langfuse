import { useState } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function useDashboardCardTabs<
  T extends readonly [{ tabTitle: string }, ...{ tabTitle: string }[]],
>(items: T) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const capture = usePostHogClientCapture();
  const activeIndex = selectedIndex < items.length ? selectedIndex : 0;
  const selectedItem: T[number] = items[activeIndex] ?? items[0];

  return {
    selectedItem,
    selectedIndex: activeIndex,
    tabs: {
      value: String(activeIndex),
      options: items.map((item, index) => ({
        value: String(index),
        label: item.tabTitle,
      })),
      onValueChange: (value: string) => {
        const index = Number(value);
        const item = items[index];
        if (!item) return;
        setSelectedIndex(index);
        capture("dashboard:chart_tab_switch", { tabLabel: item.tabTitle });
      },
    },
  };
}
