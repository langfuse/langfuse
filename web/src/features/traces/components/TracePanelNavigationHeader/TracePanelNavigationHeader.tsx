/**
 * NavigationHeader - Fixed-height search bar for navigation panel
 *
 * Responsibilities:
 * - Render search input
 * - Render toolbar buttons (expand/collapse, settings, download, timeline)
 * - Manage search input state via SearchContext
 *
 * This component has a fixed height and uses shrink-0 to maintain size.
 */

import { useSearch } from "@/src/features/traces/contexts/SearchContext";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useTraceGraphData } from "@/src/features/traces/contexts/TraceGraphDataContext";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { Command, CommandInput } from "@/src/components/ui/command";
import { Button } from "@/src/components/ui/button";
import {
  FoldVertical,
  UnfoldVertical,
  Download,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { StringParam, useQueryParam } from "use-query-params";
import { cn } from "@/src/utils/tailwind";
import { useCallback } from "react";
import { TraceViewOptionsMenuItems } from "../TraceSettingsDropdown";
import {
  downloadLegacyTraceAsJson,
  downloadServerTraceAsJson,
} from "../../fns/downloadTrace";
import { TracePanelNavigationButton } from "./components/TracePanelNavigationButton";
import { useDesktopLayoutContextOptional } from "../TraceLayoutDesktop";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useTraceAnalyticsDimensions } from "@/src/features/traces/hooks/useTraceAnalyticsDimensions";
import { toast } from "sonner";
import { TRACE_DOWNLOAD_OMIT_LARGE_FIELDS_THRESHOLD } from "@/src/features/traces/constants/traceDownloadConfig";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";

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
  const { roots, trace, observations } = useTraceData();
  const { isGraphViewAvailable } = useTraceGraphData();
  const { isV4 } = useReadPath();
  const [viewMode, setViewMode] = useQueryParam("view", StringParam);
  const capture = usePostHogClientCapture();
  const analyticsDimensions = useTraceAnalyticsDimensions();
  const isLanesEnabled = useIsFeatureEnabled("laneTimelineView", {
    projectId: trace.projectId,
  });

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

  const [handleDownload, isDownloading] =
    useWatchedPromiseCallback(async () => {
      capture("trace_detail:download_button_click", analyticsDimensions);
      try {
        if (!isV4) {
          downloadLegacyTraceAsJson({
            trace,
            observations,
          });
          return;
        }

        await downloadServerTraceAsJson({
          traceId: trace.id,
          projectId: trace.projectId,
        });

        if (observations.length >= TRACE_DOWNLOAD_OMIT_LARGE_FIELDS_THRESHOLD) {
          toast.warning(
            `Trace download excludes IO, metadata, toolDefinitions, and toolCalls for traces with ${TRACE_DOWNLOAD_OMIT_LARGE_FIELDS_THRESHOLD}+ observations.`,
          );
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to download trace JSON",
        );
      }
    }, [isV4, observations, trace, capture, analyticsDimensions]);

  const activeView: TraceViewMode =
    viewMode === "timeline"
      ? "timeline"
      : viewMode === "graph" && isGraphViewAvailable
        ? "graph"
        : viewMode === "lanes" && isLanesEnabled
          ? "lanes"
          : "tree";

  return (
    <Command className="flex h-auto shrink-0 flex-col gap-1 overflow-hidden rounded-none border-b">
      {/* Toolbar: search, download, view-options menu, view switch. flex-wrap
          lets the switch drop to its own line on a narrow panel instead of
          clipping (text segments cannot shrink). A container query cannot
          reach into the menu's portal, so menu contents never depend on it. */}
      <div className="@container/navheader flex flex-row flex-wrap items-center justify-between gap-y-1 pr-2 pl-1">
        {/* Panel Toggle Button; special p-0.5 offset to pixel align with closed
            version. Hidden while the detail panel is closed (nothing useful to
            collapse the full-width tree/timeline into). */}
        {!isDetailPanelCollapsed && (
          <div className="flex flex-row items-center p-0.5">
            <TracePanelNavigationButton
              isPanelCollapsed={isPanelCollapsed}
              onTogglePanel={onTogglePanel}
            />
          </div>
        )}
        {/* Search Input */}
        <div
          className={cn("relative flex-1", isDetailPanelCollapsed && "pl-1")}
        >
          <CommandInput
            showBorder={false}
            placeholder="Search"
            className="h-7 min-w-20 border-0 pr-0 focus:ring-0 @max-[300px]/navheader:min-w-10"
            value={searchInputValue}
            onValueChange={setSearchInputValue}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
        <div className="flex shrink-0 flex-row items-center gap-0.5">
          {/* Download stays inline (heavily used); lower-traffic tools live
              in the view-options menu. */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            disabled={isDownloading}
            title="Download trace as JSON"
            className="h-7 w-7"
          >
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                title="View options"
                aria-label="View options"
                className="h-7 w-7"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-64">
              <DropdownMenuItem onSelect={handleToggleTreeNodes}>
                {isEverythingCollapsed ? (
                  <UnfoldVertical className="mr-2 h-3.5 w-3.5" />
                ) : (
                  <FoldVertical className="mr-2 h-3.5 w-3.5" />
                )}
                {isEverythingCollapsed ? "Expand all" : "Collapse all"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <TraceViewOptionsMenuItems />
            </DropdownMenuContent>
          </DropdownMenu>

          {/* When the detail panel is closed it shows its own collapsed rail
              with a "Show detail panel" button on the right edge (DetailPanel in
              TraceLayoutDesktop, mirroring the navigation panel's rail), so the
              header needs no re-open button of its own. */}
        </div>
        {/* The view switch is its own flex item so it wraps to a second line
            on a narrow panel instead of clipping at the panel edge. */}
        <div className="flex shrink-0 items-center">
          <ViewModeSwitch
            activeView={activeView}
            showGraphSegment={isGraphViewAvailable}
            showLanesSegment={isLanesEnabled}
            onSelect={(view) => {
              // Clicking the already-active segment is a no-op — don't count it.
              if (view !== activeView) {
                capture("trace_detail:view_mode_switch", {
                  viewMode: view,
                  ...analyticsDimensions,
                });
              }
              setViewMode(view === "tree" ? null : view);
            }}
          />
        </div>
      </div>
    </Command>
  );
}

export type TraceViewMode = "tree" | "timeline" | "graph" | "lanes";

function ViewModeSwitch({
  activeView,
  showGraphSegment,
  showLanesSegment,
  onSelect,
}: {
  activeView: TraceViewMode;
  showGraphSegment: boolean;
  showLanesSegment: boolean;
  onSelect: (view: TraceViewMode) => void;
}) {
  return (
    <div className="bg-muted/60 ml-2 inline-flex h-7 shrink-0 items-center rounded-md border p-0.5">
      <ViewModeSegment
        active={activeView === "tree"}
        onClick={() => onSelect("tree")}
        label="Tree"
      />
      {/* One Timeline. What it IS depends on the Compact Timeline feature
          preview — see TracePanelNavigation — rather than on a third segment
          the user has to understand. */}
      <ViewModeSegment
        active={activeView === "timeline"}
        onClick={() => onSelect("timeline")}
        label="Timeline"
      />
      {/* Graph is a full view, not a side panel — the segment only exists for
          traces that have graph data (agent traces under the node cap). */}
      {showGraphSegment && (
        <ViewModeSegment
          active={activeView === "graph"}
          onClick={() => onSelect("graph")}
          label="Graph"
        />
      )}
      {/* Experimental (flag: laneTimelineView): swim lanes per observation
          type with idle time compressed. */}
      {showLanesSegment && (
        <ViewModeSegment
          active={activeView === "lanes"}
          onClick={() => onSelect("lanes")}
          label="Tree+"
        />
      )}
    </div>
  );
}

function ViewModeSegment({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex h-6 items-center rounded-md px-2 text-xs font-bold transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
