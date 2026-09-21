/* eslint-disable no-nested-ternary */
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
import { type GraphUnavailableReason } from "@/src/features/traces/fns/graphAvailability";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useReadPath } from "@/src/features/events";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { Command, CommandInput } from "@/src/components/ui/command";
import { Button } from "@/src/components/ui/button";
import {
  FoldVertical,
  UnfoldVertical,
  Download,
  Loader2,
  MoreHorizontal,
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
import {
  TraceSettingsDropdown,
  TraceViewOptionsMenuItems,
} from "../TraceSettingsDropdown";
import {
  downloadLegacyTraceAsJson,
  downloadServerTraceAsJson,
} from "../../fns/downloadTrace";
import { TracePanelNavigationButton } from "./components/TracePanelNavigationButton";
import { PlaybackControls, PlaybackMenuItems } from "../PlaybackControls";
import { useDesktopLayoutContextOptional } from "../TraceLayoutDesktop";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useTraceAnalyticsDimensions } from "@/src/features/traces/hooks/useTraceAnalyticsDimensions";
import { toast } from "sonner";
import { TRACE_DOWNLOAD_OMIT_LARGE_FIELDS_THRESHOLD } from "@/src/features/traces/constants/traceDownloadConfig";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";

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
  const {
    isGraphViewAvailable,
    graphAvailability,
    isLoading: isGraphLoading,
  } = useTraceGraphData();
  const { isV4 } = useReadPath();
  // Internal preview of the events-backed trace view; legacy traces have no
  // transcript to offer.
  const messagesEnabled = useIsFeatureEnabled("traceMessages") && isV4;
  const [viewMode, setViewMode] = useQueryParam("view", StringParam);
  const capture = usePostHogClientCapture();
  const analyticsDimensions = useTraceAnalyticsDimensions();

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
        : viewMode === "messages" && messagesEnabled
          ? "messages"
          : "tree";

  return (
    <Command className="flex h-auto shrink-0 flex-col gap-1 overflow-hidden rounded-none border-b">
      {/* Responsive toolbar via container queries on this row's own width — no JS
          measurement. The breakpoints are tuned to the row's actual content
          minimums (all fixed-size icon buttons plus the search input's
          min-width, so the sums are font-independent). Measured states:

            ≥ 440px   switcher labels, minor tools and transport all inline
            360-440   switcher icons-only, tools and transport still inline
            < 360px   tools AND transport folded into the "…" menu; this row
                      first overflows at 188px, well under the 260px panel min

          Hence: labels < 440px → hidden; tools and the transport < 360px →
          folded; search < 300px → narrower min-width (covers dragging to the
          panel min). If you ADD anything to this row, re-measure and retune all
          three — stale thresholds show up as a clipped switcher at default
          widths, which is what the folding exists to prevent. */}
      <div className="@container/navheader flex flex-row items-center justify-between pr-2 pl-1">
        {/* Panel Toggle Button; special p-0.5 offset to pixel align with closed
            version. Hidden while the detail panel is closed (nothing useful to
            collapse the full-width tree/timeline into). */}
        {!isDetailPanelCollapsed && (
          <div className="flex flex-row items-center p-0.5">
            <TracePanelNavigationButton
              isPanelCollapsed={isPanelCollapsed}
              onTogglePanel={onTogglePanel}
              shouldPulseToggle={shouldPulseToggle}
            />
          </div>
        )}
        {/* Search Input */}
        <div
          className={cn(
            "relative min-w-0 flex-1",
            isDetailPanelCollapsed && "pl-1",
          )}
        >
          <CommandInput
            showBorder={false}
            placeholder="Search"
            className="h-7 min-w-0 border-0 pr-0 focus:ring-0"
            value={searchInputValue}
            onValueChange={setSearchInputValue}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
        <div className="flex shrink-0 flex-row items-center gap-0.5">
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
                <UnfoldVertical className="h-3.5 w-3.5" />
              ) : (
                <FoldVertical className="h-3.5 w-3.5" />
              )}
            </Button>

            <TraceSettingsDropdown />

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
          </div>

          {/* …and folded into an overflow menu when it's narrow. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                title="More"
                aria-label="More options"
                className="h-7 w-7 @min-[510px]/navheader:hidden"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
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
              <DropdownMenuItem
                onSelect={() => handleDownload()}
                disabled={isDownloading}
              >
                <Download className="mr-2 h-3.5 w-3.5" />
                Download trace as JSON
              </DropdownMenuItem>
              <PlaybackMenuItems />
              <DropdownMenuSeparator />
              <TraceViewOptionsMenuItems />
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Playback transport + circular time-progress ring. View-agnostic:
              shown in both Tree and Timeline views (see PlaybackControls) — and
              folded into the overflow menu on a narrow panel, like the tools
              above it. Two more 28px buttons are what tipped this row over: the
              search input collapsed to "Se" and the switch clipped. */}
          <div className="hidden flex-row items-center @min-[510px]/navheader:flex">
            <PlaybackControls />
          </div>

          <ViewModeSwitch
            activeView={activeView}
            graphDisabledReason={graphDisabledReason}
            showMessages={messagesEnabled}
            onSelect={(view) => {
              // Clicking the already-active segment is a no-op — don't count it.
              if (view !== activeView) {
                capture("trace_detail:view_mode_switch", {
                  viewMode: view,
                  ...analyticsDimensions,
                });
              }
              setViewMode(view === "tree" ? null : view);
              // The transcript wants the width; the rail's "Show detail
              // panel" button and selecting an observation bring it back.
              if (view === "messages")
                layout?.detailPanelRef.current?.collapse();
            }}
          />
          {/* When the detail panel is closed it shows its own collapsed rail
              with a "Show detail panel" button on the right edge (DetailPanel in
              TraceLayoutDesktop, mirroring the navigation panel's rail), so the
              header needs no re-open button of its own. */}
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

type TraceViewMode = "tree" | "timeline" | "graph" | "messages";

function ViewModeSwitch({
  activeView,
  graphDisabledReason,
  showMessages,
  onSelect,
}: {
  activeView: TraceViewMode;
  /** Present when the trace has no graph: the segment renders disabled. */
  graphDisabledReason?: string;
  /** Internal preview: the Messages segment exists only for internal users. */
  showMessages: boolean;
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
      <ViewModeSegment
        active={activeView === "graph"}
        onClick={() => onSelect("graph")}
        label="Graph"
        disabled={Boolean(graphDisabledReason)}
        title={graphDisabledReason}
      />
      {showMessages && (
        <ViewModeSegment
          active={activeView === "messages"}
          onClick={() => onSelect("messages")}
          label="Messages"
        />
      )}
    </div>
  );
}

function ViewModeSegment({
  active,
  onClick,
  label,
  disabled = false,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  /** Why the view is unavailable; shown in a tooltip. */
  title?: string;
}) {
  const segment = (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      aria-pressed={active}
      title={disabled ? undefined : label}
      className={cn(
        "flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-bold transition-colors",
        disabled && "cursor-not-allowed opacity-40",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  // A native title does not reliably surface on a segment this small.
  if (!disabled || !title) return segment;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{segment}</TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}
