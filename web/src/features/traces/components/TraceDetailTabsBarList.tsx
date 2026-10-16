import { type ReactNode } from "react";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/utils/tailwind";

import type { DetailTab } from "../contexts/SelectionContext";

const labels: Record<DetailTab, string> = {
  preview: "Preview",
  messages: "Messages",
  attributes: "Attributes",
  scores: "Scores",
  log: "Log View",
};

const rowClassName = "flex h-9 shrink-0 items-center border-b";

const LOADING_TAB_WIDTHS = ["w-14", "w-16", "w-12"];

type TraceDetailTabsBarListProps = {
  tabs: DetailTab[];
  logViewDescription: string;
  trailingControls: ReactNode;
};

/**
 * Tab bar for the trace and observation detail panels. Which tabs a panel
 * shows depends on the trace, the project role, and the enabled features, so
 * the row is anywhere between two and five tabs wide; the ones that do not fit
 * next to the trailing controls move behind an overflow menu.
 */
export function TraceDetailTabsBarList(
  props: TraceDetailTabsBarListProps | { isLoading: true },
) {
  if ("isLoading" in props) return <TraceDetailTabsBarListLoading />;
  return <LoadedTraceDetailTabsBarList {...props} />;
}

/** Label bars in trigger-sized slots, no menu; the view toggle as one block. */
function TraceDetailTabsBarListLoading() {
  return (
    <div className={rowClassName}>
      <div className="flex min-w-0 flex-1 items-center overflow-hidden">
        {LOADING_TAB_WIDTHS.map((width) => (
          <div key={width} className="px-4">
            <Skeleton className={cn("h-3.5", width)} />
          </div>
        ))}
      </div>
      <div className="h-fit shrink-0 py-0.5 pr-4 pl-2">
        <Skeleton className="h-6 w-32 rounded-md" />
      </div>
    </div>
  );
}

function LoadedTraceDetailTabsBarList({
  tabs,
  logViewDescription,
  trailingControls,
}: TraceDetailTabsBarListProps) {
  return (
    <div className={rowClassName}>
      <Tabs.List variant="underline" overflow="menu" aria-label="Detail views">
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab}
            value={tab}
            label={labels[tab]}
            internal={tab === "messages"}
            tooltip={tab === "log" ? logViewDescription : undefined}
          />
        ))}
      </Tabs.List>
      {trailingControls}
    </div>
  );
}
