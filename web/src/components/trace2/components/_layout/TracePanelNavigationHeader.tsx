/**
 * NavigationHeader - Fixed-height search bar for navigation panel
 *
 * Responsibilities:
 * - Render search input
 * - Render toolbar buttons (expand/collapse, settings, download, timeline)
 * - Manage search input state via SearchContext
 *
 * This component has a fixed height and uses flex-shrink-0 to maintain size.
 */

import { useSearch } from "../../contexts/SearchContext";
import { useSelection } from "../../contexts/SelectionContext";
import { useTraceData } from "../../contexts/TraceDataContext";
import { useTraceGraphData } from "../../contexts/TraceGraphDataContext";
import { Command, CommandInput } from "@/src/components/ui/command";
import { Button } from "@/src/components/ui/button";
import { FoldVertical, UnfoldVertical, Download } from "lucide-react";
import { StringParam, useQueryParam } from "use-query-params";
import { cn } from "@/src/utils/tailwind";
import { useCallback } from "react";
import { TraceSettingsDropdown } from "../TraceSettingsDropdown";
import { downloadTraceAsJson } from "../../lib/download-trace";
import { TracePanelNavigationButton } from "./TracePanelNavigationButton";

interface TracePanelNavigationHeaderProps {
  isPanelCollapsed: boolean;
  onTogglePanel: () => void;
  shouldPulseToggle?: boolean;
}

export function TracePanelNavigationHeader(
  props: TracePanelNavigationHeaderProps,
) {
  if (props.isPanelCollapsed) {
    return <TracePanelNavigationHeaderCollapsed {...props} />;
  }
  return <TracePanelNavigationHeaderExpanded {...props} />;
}

function TracePanelNavigationHeaderCollapsed({
  isPanelCollapsed,
  onTogglePanel,
  shouldPulseToggle = false,
}: TracePanelNavigationHeaderProps) {
  return (
    <div className="flex w-full flex-row items-center justify-center p-2">
      <TracePanelNavigationButton
        isPanelCollapsed={isPanelCollapsed}
        onTogglePanel={onTogglePanel}
        shouldPulseToggle={shouldPulseToggle}
      />
    </div>
  );
}

function TracePanelNavigationHeaderExpanded({
  isPanelCollapsed,
  onTogglePanel,
  shouldPulseToggle = false,
}: TracePanelNavigationHeaderProps) {
  const { searchInputValue, setSearchInputValue, setSearchQueryImmediate } =
    useSearch();
  const { expandAll, collapseAll, collapsedNodes } = useSelection();
  const { roots, trace, observations } = useTraceData();
  const { isGraphViewAvailable } = useTraceGraphData();
  const [viewMode, setViewMode] = useQueryParam("view", StringParam);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Skip debouncing and search immediately
      setSearchQueryImmediate(searchInputValue);
    }
  };

  // Check if everything is collapsed (all roots collapsed)
  const isEverythingCollapsed =
    roots.length > 0 && roots.every((r) => collapsedNodes.has(r.id));

  // Collect all node IDs for collapse all (from all roots)
  const getAllNodeIds = useCallback((node: (typeof roots)[0]): string[] => {
    const ids = [node.id];
    node.children.forEach((child) => {
      ids.push(...getAllNodeIds(child));
    });
    return ids;
  }, []);

  const handleToggleTreeNodes = useCallback(() => {
    if (isEverythingCollapsed) {
      expandAll();
    } else {
      const allIds = roots.flatMap((root) => getAllNodeIds(root));
      collapseAll(allIds);
    }
  }, [isEverythingCollapsed, expandAll, collapseAll, getAllNodeIds, roots]);

  const handleDownload = useCallback(() => {
    downloadTraceAsJson({
      trace,
      observations,
    });
  }, [trace, observations]);

  const isTimelineView = viewMode === "timeline";

  return (
    <Command className="mt-1 flex h-auto flex-shrink-0 flex-col gap-1 overflow-hidden rounded-none border-b">
      <div className="flex flex-row justify-between pl-1 pr-2">
        {/* Panel Toggle Button; special p-0.5 offset to pixel align with closed version */}
        <div className="flex flex-row items-center p-0.5">
          <TracePanelNavigationButton
            isPanelCollapsed={isPanelCollapsed}
            onTogglePanel={onTogglePanel}
            shouldPulseToggle={shouldPulseToggle}
          />
        </div>
        {/* Search Input */}
        <div className="relative flex-1">
          <CommandInput
            showBorder={false}
            placeholder="Search"
            className="h-7 min-w-20 border-0 pr-0 focus:ring-0"
            value={searchInputValue}
            onValueChange={setSearchInputValue}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
        <div className="flex flex-row items-center gap-0.5">
          {/* Expand/Collapse All Button */}
          <Button
            onClick={handleToggleTreeNodes}
            variant="ghost"
            size="icon"
            title={isEverythingCollapsed ? "Expand all" : "Collapse all"}
            className="h-7 w-7"
          >
            {isEverythingCollapsed ? (
              <UnfoldVertical className="h-3.5 w-3.5" />
            ) : (
              <FoldVertical className="h-3.5 w-3.5" />
            )}
          </Button>

          {/* Settings Dropdown */}
          <TraceSettingsDropdown isGraphViewAvailable={isGraphViewAvailable} />

          {/* Download Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            title="Download trace as JSON"
            className="h-7 w-7"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>

          {/* Timeline Toggle Button */}
          <Button
            variant={isTimelineView ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode(isTimelineView ? null : "timeline")}
            className={cn(
              "h-7 px-2 text-xs",
              isTimelineView && "bg-primary text-primary-foreground",
            )}
          >
            <span className="text-xs">Timeline</span>
          </Button>
        </div>
      </div>
    </Command>
  );
}
