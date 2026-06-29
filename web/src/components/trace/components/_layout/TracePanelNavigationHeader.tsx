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

import { useSearch } from "../../contexts/SearchContext";
import { useSelection } from "../../contexts/SelectionContext";
import { useTraceData } from "../../contexts/TraceDataContext";
import { useTraceGraphData } from "../../contexts/TraceGraphDataContext";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { Command, CommandInput } from "@/src/components/ui/command";
import { Button } from "@/src/components/ui/button";
import {
  FoldVertical,
  UnfoldVertical,
  Download,
  Loader2,
  ListTree,
  GanttChartSquare,
  MoreHorizontal,
  type LucideIcon,
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
} from "../../lib/download-trace";
import { TracePanelNavigationButton } from "./TracePanelNavigationButton";
import { useDesktopLayoutContextOptional } from "./TraceLayoutDesktop";
import { toast } from "sonner";
import { TRACE_DOWNLOAD_OMIT_LARGE_FIELDS_THRESHOLD } from "@/src/features/traces/shared/traceDownloadConfig";
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
  const { isGraphViewAvailable } = useTraceGraphData();
  const { isBetaEnabled } = useV4Beta();
  const [viewMode, setViewMode] = useQueryParam("view", StringParam);

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
      expandAll();
    } else {
      const allIds = roots.flatMap((root) => getAllNodeIds(root));
      collapseAll(allIds);
    }
  }, [isEverythingCollapsed, expandAll, collapseAll, getAllNodeIds, roots]);

  const [handleDownload, isDownloading] =
    useWatchedPromiseCallback(async () => {
      try {
        if (!isBetaEnabled) {
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
    }, [isBetaEnabled, observations, trace]);

  const isTimelineView = viewMode === "timeline";

  return (
    <Command className="flex h-auto shrink-0 flex-col gap-1 overflow-hidden rounded-none border-b">
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
          className={cn("relative flex-1", isDetailPanelCollapsed && "pl-1")}
        >
          <CommandInput
            showBorder={false}
            placeholder="Search"
            className="h-7 min-w-20 border-0 pr-0 focus:ring-0"
            value={searchInputValue}
            onValueChange={setSearchInputValue}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
        <div className="flex shrink-0 flex-row items-center gap-0.5">
          {/* Minor tools — inline when the panel is wide enough. */}
          <div className="hidden flex-row items-center gap-0.5 @min-[380px]/navheader:flex">
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

            <TraceSettingsDropdown
              isGraphViewAvailable={isGraphViewAvailable}
            />

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
                className="h-7 w-7 @min-[380px]/navheader:hidden"
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
              <DropdownMenuSeparator />
              <TraceViewOptionsMenuItems
                isGraphViewAvailable={isGraphViewAvailable}
              />
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Tree / Timeline segmented switch (labels collapse to icons when
              the panel is narrow — see @container/navheader). */}
          <ViewModeSwitch
            isTimelineView={isTimelineView}
            onSelect={(timeline) => setViewMode(timeline ? "timeline" : null)}
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

function ViewModeSwitch({
  isTimelineView,
  onSelect,
}: {
  isTimelineView: boolean;
  onSelect: (timeline: boolean) => void;
}) {
  return (
    <div className="bg-muted/60 ml-2 inline-flex h-7 shrink-0 items-center rounded-md border p-0.5">
      <ViewModeSegment
        active={!isTimelineView}
        onClick={() => onSelect(false)}
        icon={ListTree}
        label="Tree"
      />
      <ViewModeSegment
        active={isTimelineView}
        onClick={() => onSelect(true)}
        icon={GanttChartSquare}
        label="Timeline"
      />
    </div>
  );
}

function ViewModeSegment({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="@max-[360px]/navheader:hidden">{label}</span>
    </button>
  );
}
