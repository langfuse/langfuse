import { type ReactNode } from "react";

import { TabsBarList } from "@/src/components/ui/tabs-bar";
import { useFitsAvailableWidth } from "@/src/hooks/useFitsAvailableWidth";
import { cn } from "@/src/utils/tailwind";

import { TraceDetailTabMenu } from "./TraceDetailTabMenu";
import type { DetailTab } from "../contexts/SelectionContext";

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
export function TraceDetailTabsBarList({
  tabs,
  selectedTab,
  onSelect,
  triggers,
  trailingControls,
}: {
  tabs: DetailTab[];
  selectedTab: DetailTab;
  onSelect: (tab: DetailTab) => void;
  triggers: ReactNode;
  trailingControls: ReactNode;
}) {
  const { availableRef, contentRef, fits } = useFitsAvailableWidth<
    HTMLDivElement,
    HTMLDivElement
  >();

  return (
    <TabsBarList className="shrink-0">
      {/* A zero flex basis makes this the row space left over by the trailing
          controls, so the triggers are compared against the width they can
          actually occupy without that width depending on them in turn. */}
      <div
        ref={availableRef}
        className="relative flex h-full min-w-0 flex-1 items-center overflow-hidden"
      >
        {/* The triggers stay mounted while the dropdown is shown so their
            natural width remains measurable and the row can come back once
            there is room. Hiding them also takes them out of the tab order. */}
        <div
          ref={contentRef}
          className={cn(
            "flex h-full w-max shrink-0 items-center",
            !fits && "invisible absolute",
          )}
        >
          {triggers}
        </div>
        {!fits && (
          <TraceDetailTabMenu
            tabs={tabs}
            selectedTab={selectedTab}
            onSelect={onSelect}
          />
        )}
      </div>
      {trailingControls}
    </TabsBarList>
  );
}
