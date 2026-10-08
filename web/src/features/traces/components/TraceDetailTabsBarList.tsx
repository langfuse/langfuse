import { type ReactNode } from "react";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useFitsAvailableWidth } from "@/src/hooks/useFitsAvailableWidth";
import { cn } from "@/src/utils/tailwind";

import { TraceDetailTabMenu } from "./TraceDetailTabMenu";
import type { DetailTab } from "../contexts/SelectionContext";

type TraceDetailTabsBarListProps = {
  tabs: DetailTab[];
  selectedTab: DetailTab;
  onSelect: (tab: DetailTab) => void;
  triggers: ReactNode;
  trailingControls: ReactNode;
};

const availableClassName =
  "relative flex h-full min-w-0 flex-1 items-center overflow-hidden";
const triggersClassName = "flex h-full w-max shrink-0 items-center";

const LOADING_TAB_WIDTHS = ["w-14", "w-16", "w-12"];

/**
 * Tab bar for the trace and observation detail panels. Keeps the tab triggers
 * visible for as long as they fit next to the trailing controls and replaces
 * them with a dropdown once they stop fitting.
 *
 * Which tabs a panel shows depends on the trace, the project role, and the
 * enabled features, so the row is anywhere between two and five tabs wide. The
 * swap therefore follows the measured width of the triggers: a fixed panel
 * width would have to assume the widest tab set and would collapse the narrow
 * ones while there is still room for them.
 */
export function TraceDetailTabsBarList(
  props: TraceDetailTabsBarListProps | { isLoading: true },
) {
  if ("isLoading" in props) return <TraceDetailTabsBarListLoading />;
  return <LoadedTraceDetailTabsBarList {...props} />;
}

/** Real triggers with placeholder labels; the view toggle as one block. */
function TraceDetailTabsBarListLoading() {
  return (
    <Tabs.List variant="underline">
      <div className={availableClassName}>
        <div className={triggersClassName}>
          {LOADING_TAB_WIDTHS.map((width, index) => (
            <Tabs.Trigger key={width} value={`loading-${index}`}>
              <Skeleton className={cn("h-3.5", width)} />
            </Tabs.Trigger>
          ))}
        </div>
      </div>
      <div className="ml-auto h-fit shrink-0 py-0.5 pr-4 pl-2">
        <Skeleton className="h-6 w-32 rounded-md" />
      </div>
    </Tabs.List>
  );
}

function LoadedTraceDetailTabsBarList({
  tabs,
  selectedTab,
  onSelect,
  triggers,
  trailingControls,
}: TraceDetailTabsBarListProps) {
  const { availableRef, contentRef, fits } = useFitsAvailableWidth<
    HTMLDivElement,
    HTMLDivElement
  >();

  return (
    <Tabs.List variant="underline">
      {/* A zero flex basis makes this the row space left over by the trailing
          controls, so the triggers are compared against the width they can
          actually occupy without that width depending on them in turn. */}
      <div ref={availableRef} className={availableClassName}>
        {/* The triggers stay mounted while the dropdown is shown so their
            natural width remains measurable and the row can come back once
            there is room. Hiding them also takes them out of the tab order.
            Until the first measurement neither presentation shows. */}
        <div
          ref={contentRef}
          className={cn(
            triggersClassName,
            fits !== true && "invisible",
            fits === false && "absolute",
          )}
        >
          {triggers}
        </div>
        {fits === false && (
          <TraceDetailTabMenu
            tabs={tabs}
            selectedTab={selectedTab}
            onSelect={onSelect}
          />
        )}
      </div>
      {trailingControls}
    </Tabs.List>
  );
}
