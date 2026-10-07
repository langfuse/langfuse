/* eslint-disable no-nested-ternary */
/**
 * NavigationHeader - Responsive search and controls for the navigation panel
 *
 * Responsibilities:
 * - Render search input
 * - Render toolbar buttons (expand/collapse, settings, timeline)
 * - Manage search input state via SearchContext
 *
 * Search moves to a second row when space is tight, while keeping the same DOM
 * input so focus and the current query survive panel resizing.
 */

import { useSearch } from "@/src/features/traces/contexts/SearchContext";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useTraceGraphData } from "@/src/features/traces/contexts/TraceGraphDataContext";
import { type GraphUnavailableReason } from "@/src/features/traces/fns/graphAvailability";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { Command, CommandInput } from "@/src/components/ui/command";
import { Button } from "@/src/components/ui/button";
import { ToggleGroup } from "@/src/components/design-system/ToggleGroup/ToggleGroup";
import {
  ChevronDown,
  FoldVertical,
  UnfoldVertical,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuController,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { StringParam, useQueryParam } from "use-query-params";
import { cn } from "@/src/utils/tailwind";
import { useCallback } from "react";
import {
  TraceSettingsDropdown,
  TraceViewOptionsMenuItems,
} from "../TraceSettingsDropdown";
import { TracePanelNavigationButton } from "./components/TracePanelNavigationButton";
import { useDesktopLayoutContextOptional } from "../TraceLayoutDesktop";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useTraceAnalyticsDimensions } from "@/src/features/traces/hooks/useTraceAnalyticsDimensions";
import { useElementSize } from "@/src/hooks/useElementSize";

interface TracePanelNavigationHeaderProps {
  isPanelCollapsed: boolean;
  onTogglePanel: () => void;
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
}: TracePanelNavigationHeaderProps) {
  return (
    <div className="flex w-full flex-row items-center justify-center p-2">
      <TracePanelNavigationButton
        isPanelCollapsed={isPanelCollapsed}
        onTogglePanel={onTogglePanel}
      />
    </div>
  );
}

function TracePanelNavigationHeaderExpanded({
  isPanelCollapsed,
  onTogglePanel,
}: TracePanelNavigationHeaderProps) {
  const { searchInputValue, setSearchInputValue, setSearchQueryImmediate } =
    useSearch();
  const { expandAll, collapseAll, collapsedNodes } = useSelection();
  const { roots } = useTraceData();
  const {
    isGraphViewAvailable,
    graphAvailability,
    isLoading: isGraphLoading,
  } = useTraceGraphData();
  const [viewMode, setViewMode] = useQueryParam("view", StringParam);
  const capture = usePostHogClientCapture();
  const analyticsDimensions = useTraceAnalyticsDimensions();
  const [headerContainerRef, headerContainerSize] =
    useElementSize<HTMLDivElement>();
  const isSearchWrapped = (headerContainerSize?.width ?? Infinity) <= 299;

  // When the detail (info) panel is closed, the tree/timeline owns the whole
  // surface — so the left "collapse panel" toggle would only shrink the one
  // thing on screen. Hide it. Re-opening the detail panel is handled by its own
  // collapsed rail (see TraceLayoutDesktop), so the header needs no button.
  const layout = useDesktopLayoutContextOptional();
  const isDetailPanelCollapsed = layout?.isDetailPanelCollapsed ?? false;

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
      capture("trace_detail:observation_tree_expand", analyticsDimensions);
      expandAll();
    } else {
      capture("trace_detail:observation_tree_collapse", analyticsDimensions);
      const allIds = roots.flatMap((root) => getAllNodeIds(root));
      collapseAll(allIds);
    }
  }, [
    isEverythingCollapsed,
    expandAll,
    collapseAll,
    getAllNodeIds,
    roots,
    capture,
    analyticsDimensions,
  ]);

  // Hold the Graph segment while its query loads, else it vanishes and returns
  // on every trace switch. Stale ?view=graph then falls back to tree.
  const graphResolved = isGraphViewAvailable || isGraphLoading;
  const graphDisabledReason =
    graphAvailability.available || isGraphLoading
      ? undefined
      : GRAPH_UNAVAILABLE_COPY[graphAvailability.reason];
  const activeView: TraceViewMode =
    viewMode === "timeline"
      ? "timeline"
      : viewMode === "graph" && graphResolved
        ? "graph"
        : "tree";

  const handleSelectView = (view: TraceViewMode) => {
    // Clicking the already-active option is a no-op — don't count it.
    if (view !== activeView) {
      capture("trace_detail:view_mode_switch", {
        viewMode: view,
        ...analyticsDimensions,
      });
    }
    setViewMode(view === "tree" ? null : view);
  };

  const renderOverflowMenuItems = () => (
    <>
      <DropdownMenuItem onSelect={handleToggleTreeNodes}>
        {isEverythingCollapsed ? (
          <UnfoldVertical className="icon-base text-icon-foreground mr-2" />
        ) : (
          <FoldVertical className="icon-base text-icon-foreground mr-2" />
        )}
        {isEverythingCollapsed ? "Expand all" : "Collapse all"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <TraceViewOptionsMenuItems />
    </>
  );
  const searchControl = (
    <div
      key="search"
      className={cn(
        "@max-[299px]/navheader:bg-background @max-[299px]/navheader:focus-within:border-ring @max-[299px]/navheader:focus-within:ring-ring/30 relative col-start-2 row-start-1 min-w-0 @max-[299px]/navheader:col-span-3 @max-[299px]/navheader:col-start-1 @max-[299px]/navheader:row-start-2 @max-[299px]/navheader:ml-1 @max-[299px]/navheader:rounded-md @max-[299px]/navheader:border @max-[299px]/navheader:shadow-xs @max-[299px]/navheader:focus-within:ring-2 @max-[299px]/navheader:[&>div]:p-0",
        isDetailPanelCollapsed && "pl-1",
      )}
    >
      <CommandInput
        showBorder={false}
        placeholder="Search"
        className="@max-[299px]/navheader:placeholder:text-muted-foreground placeholder:text-muted-foreground h-7 min-w-0 border-0 pr-0 text-xs placeholder:font-mono focus:ring-0 @max-[299px]/navheader:h-[1.625rem]"
        value={searchInputValue}
        onValueChange={setSearchInputValue}
        onKeyDown={handleSearchKeyDown}
      />
    </div>
  );

  return (
    <Command className="h-auto shrink-0 overflow-hidden rounded-none border-b bg-transparent">
      {/* Container queries keep the primary view switch visible for as long as
          it fits. Search moves below the controls before that switch collapses,
          and remains the same input across every layout. */}
      <div ref={headerContainerRef} className="@container/navheader">
        <div className="grid min-h-8 grid-cols-[auto_minmax(0,1fr)_auto] items-center py-1 pr-3 pl-1 @max-[299px]/navheader:min-h-0 @max-[299px]/navheader:gap-y-1 @max-[299px]/navheader:pt-1 @max-[299px]/navheader:pb-1.5">
          {/* Panel Toggle Button; special p-0.5 offset to pixel align with closed
              version. Hidden while the detail panel is closed (nothing useful to
              collapse the full-width tree/timeline into). */}
          {!isDetailPanelCollapsed && (
            <div
              key="toggle"
              className="col-start-1 row-start-1 flex flex-row items-center p-0.5"
            >
              <TracePanelNavigationButton
                isPanelCollapsed={isPanelCollapsed}
                onTogglePanel={onTogglePanel}
              />
            </div>
          )}
          {/* Keep keyboard order in sync when search wraps below the tools.
              The keyed element is moved rather than duplicated, preserving its
              value and focus across panel resizing. */}
          {!isSearchWrapped ? searchControl : null}
          <div
            key="tools"
            className="col-start-3 row-start-1 flex shrink-0 flex-row items-center gap-0.5"
          >
            {/* Minor tools — inline when the panel is wide enough. */}
            <div className="hidden flex-row items-center gap-0.5 @min-[510px]/navheader:flex">
              <Button
                onClick={handleToggleTreeNodes}
                variant="ghost"
                size="icon"
                title={isEverythingCollapsed ? "Expand all" : "Collapse all"}
                className="h-7 w-7"
              >
                {isEverythingCollapsed ? (
                  <UnfoldVertical className="icon-base text-icon-foreground" />
                ) : (
                  <FoldVertical className="icon-base text-icon-foreground" />
                )}
              </Button>

              <TraceSettingsDropdown />
            </div>

            <div className="@min-[510px]/navheader:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="More"
                    aria-label="More options"
                    className="h-7 w-7"
                  >
                    <MoreVertical className="icon-base text-icon-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-64">
                  {renderOverflowMenuItems()}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="ml-2 hidden @min-[330px]/navheader:block">
              <ViewModeSwitch
                activeView={activeView}
                graphDisabledReason={graphDisabledReason}
                onSelect={handleSelectView}
              />
            </div>
            <div className="ml-2 @min-[330px]/navheader:hidden">
              <DropdownMenuController
                align="end"
                renderMenu={() => (
                  <DropdownMenuRadioGroup
                    value={activeView}
                    onValueChange={(value) =>
                      handleSelectView(value as TraceViewMode)
                    }
                  >
                    <DropdownMenuRadioItem value="tree">
                      Tree
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="timeline">
                      Timeline
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem
                      value="graph"
                      disabled={Boolean(graphDisabledReason)}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span>Graph</span>
                        {graphDisabledReason && (
                          <span className="text-muted-foreground text-xs font-normal">
                            {graphDisabledReason}
                          </span>
                        )}
                      </span>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                )}
              >
                {({ isOpen, Trigger }) => (
                  <Trigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Select trace view"
                      className="h-7 min-w-20 justify-between gap-1 px-2 text-xs font-bold"
                    >
                      {TRACE_VIEW_LABELS[activeView]}
                      <ChevronDown
                        className={cn(
                          "text-foreground-tertiary icon-base transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    </Button>
                  </Trigger>
                )}
              </DropdownMenuController>
            </div>
            {/* When the detail panel is closed it shows its own collapsed rail
                with a "Show detail panel" button on the right edge (DetailPanel in
                TraceLayoutDesktop, mirroring the navigation panel's rail), so the
                header needs no re-open button of its own. */}
          </div>
          {isSearchWrapped ? searchControl : null}
        </div>
      </div>
    </Command>
  );
}

const GRAPH_UNAVAILABLE_COPY: Record<GraphUnavailableReason, string> = {
  "no-data": "No graph data on this trace.",
  "too-large": "Too many observations to graph.",
  "no-structure": "Nothing to graph. This trace has only one node.",
};

type TraceViewMode = "tree" | "timeline" | "graph";

const TRACE_VIEW_LABELS: Record<TraceViewMode, string> = {
  tree: "Tree",
  timeline: "Timeline",
  graph: "Graph",
};

function ViewModeSwitch({
  activeView,
  graphDisabledReason,
  onSelect,
}: {
  activeView: TraceViewMode;
  /** Present when the trace has no graph: the segment renders disabled. */
  graphDisabledReason?: string;
  onSelect: (view: TraceViewMode) => void;
}) {
  return (
    <ToggleGroup
      value={activeView}
      onValueChange={(value) => onSelect(value as TraceViewMode)}
    >
      <ToggleGroup.List size="md" aria-label="Trace view">
        <ToggleGroup.Trigger value="tree" label="Tree" />
        {/* One Timeline. What it IS depends on the Compact Timeline feature
            preview — see TracePanelNavigation — rather than on a third segment
            the user has to understand. */}
        <ToggleGroup.Trigger value="timeline" label="Timeline" />
        {graphDisabledReason ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-hidden"
              >
                <ToggleGroup.Trigger value="graph" disabled label="Graph" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{graphDisabledReason}</TooltipContent>
          </Tooltip>
        ) : (
          <ToggleGroup.Trigger value="graph" label="Graph" />
        )}
      </ToggleGroup.List>
    </ToggleGroup>
  );
}
