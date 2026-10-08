import { type ComponentProps } from "react";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { InternalFeatureBadge } from "@/src/features/feature-flags";
import { DETAIL_TAB_LABELS } from "../constants/detailTabs";
import { TraceDetailTabsBarList } from "./TraceDetailTabsBarList";

export function TraceDetailTabs({
  tabs,
  selectedTab,
  onSelect,
  observationCount,
  isLogViewVirtualized,
  trailingControls,
}: Pick<
  Extract<ComponentProps<typeof TraceDetailTabsBarList>, { tabs: unknown }>,
  "tabs" | "selectedTab" | "onSelect" | "trailingControls"
> & {
  observationCount: number;
  isLogViewVirtualized: boolean;
}) {
  return (
    <TraceDetailTabsBarList
      tabs={tabs}
      selectedTab={selectedTab}
      onSelect={onSelect}
      trailingControls={trailingControls}
      triggers={tabs.map((tab) => (
        <Tabs.Trigger key={tab} value={tab}>
          {tab === "log" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{DETAIL_TAB_LABELS[tab]}</span>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                {isLogViewVirtualized
                  ? `Shows all ${observationCount} observations with virtualization enabled.`
                  : "Shows all observations concatenated. Great for quickly scanning through them."}
              </TooltipContent>
            </Tooltip>
          ) : (
            DETAIL_TAB_LABELS[tab]
          )}
          {tab === "messages" && <InternalFeatureBadge />}
        </Tabs.Trigger>
      ))}
    />
  );
}
