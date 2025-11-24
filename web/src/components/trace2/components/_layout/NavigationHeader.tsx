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
import { Command, CommandInput } from "@/src/components/ui/command";
import { Button } from "@/src/components/ui/button";
import { FoldVertical, UnfoldVertical } from "lucide-react";
import { StringParam, useQueryParam } from "use-query-params";
import { cn } from "@/src/utils/tailwind";
import { useCallback } from "react";

export function NavigationHeader() {
  const { searchInputValue, setSearchInputValue } = useSearch();
  const { expandAll, collapseAll, collapsedNodes } = useSelection();
  const { tree } = useTraceData();
  const [viewMode, setViewMode] = useQueryParam("view", StringParam);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // TODO: Implement immediate search on Enter
    }
  };

  // Check if everything is collapsed
  const isEverythingCollapsed = collapsedNodes.has(tree.id);

  // Collect all node IDs for collapse all
  const getAllNodeIds = useCallback((node: typeof tree): string[] => {
    const ids = [node.id];
    node.children.forEach((child) => {
      ids.push(...getAllNodeIds(child));
    });
    return ids;
  }, []);

  const handleToggleExpandCollapseAll = useCallback(() => {
    if (isEverythingCollapsed) {
      expandAll();
    } else {
      const allIds = getAllNodeIds(tree);
      collapseAll(allIds);
    }
  }, [isEverythingCollapsed, expandAll, collapseAll, getAllNodeIds, tree]);

  const isTimelineView = viewMode === "timeline";

  return (
    <Command className="mt-1 flex h-auto flex-shrink-0 flex-col gap-1 overflow-hidden rounded-none border-b">
      <div className="flex flex-row justify-between pl-1 pr-2">
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
            onClick={handleToggleExpandCollapseAll}
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
