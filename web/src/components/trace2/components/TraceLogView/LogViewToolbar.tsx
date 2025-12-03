/**
 * LogViewToolbar - Controls for log view search and actions.
 *
 * Provides:
 * - Search input for filtering observations (hidden in JSON view)
 * - Action buttons: expand/collapse all, copy JSON, download JSON
 * - Large Trace indicator for virtualized mode
 */

import { memo, useState } from "react";
import {
  FoldVertical,
  UnfoldVertical,
  Copy,
  Download,
  Check,
  IndentIncrease,
  Timer,
  Loader2,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Command, CommandInput } from "@/src/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { cn } from "@/src/utils/tailwind";

export interface LogViewToolbarProps {
  /** Current search query */
  searchQuery: string;
  /** Callback when search query changes */
  onSearchChange: (query: string) => void;
  /** Whether virtualization is active (for large traces) */
  isVirtualized?: boolean;
  /** Total number of observations (shown in Large Trace indicator) */
  observationCount?: number;
  /** Number of observations with loaded I/O data (for cache-only mode) */
  loadedObservationCount?: number;
  /** Callback to toggle expand/collapse all (non-virtualized only) */
  onToggleExpandAll?: () => void;
  /** Whether all rows are expanded */
  allRowsExpanded?: boolean;
  /** Callback to copy JSON */
  onCopyJson?: () => void;
  /** Callback to download JSON */
  onDownloadJson?: () => void;
  /** Whether download/copy uses cached I/O only (doesn't load all) */
  isDownloadCacheOnly?: boolean;
  /** Current view type (pretty/json) */
  currentView?: "pretty" | "json";
  /** Whether indent visualization is enabled */
  indentEnabled?: boolean;
  /** Whether indent toggle is disabled (tree too deep) */
  indentDisabled?: boolean;
  /** Callback to toggle indent visualization */
  onToggleIndent?: () => void;
  /** Whether milliseconds are shown in time values */
  showMilliseconds?: boolean;
  /** Callback to toggle milliseconds display */
  onToggleMilliseconds?: () => void;
  /** Whether download/copy is currently loading */
  isDownloadLoading?: boolean;
}

/**
 * Toolbar for log view controls.
 */
export const LogViewToolbar = memo(function LogViewToolbar({
  searchQuery,
  onSearchChange,
  isVirtualized = true,
  observationCount,
  loadedObservationCount,
  onToggleExpandAll,
  allRowsExpanded,
  onCopyJson,
  onDownloadJson,
  isDownloadCacheOnly = false,
  currentView = "pretty",
  indentEnabled = false,
  indentDisabled = false,
  onToggleIndent,
  showMilliseconds = false,
  onToggleMilliseconds,
  isDownloadLoading = false,
}: LogViewToolbarProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyClick = () => {
    setIsCopied(true);
    onCopyJson?.();
    setTimeout(() => setIsCopied(false), 1000);
  };

  return (
    <div className="flex h-9 flex-shrink-0 items-center gap-1.5 border-b bg-background px-2">
      {/* Large Trace indicator - only shown for virtualized mode */}
      {isVirtualized && (
        <HoverCard openDelay={200}>
          <HoverCardTrigger asChild>
            <span className="cursor-help rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
              Large Trace
            </span>
          </HoverCardTrigger>
          <HoverCardContent
            align="start"
            className="w-72 text-sm"
            sideOffset={8}
          >
            <p className="font-medium">Optimized for performance</p>
            <p className="mt-1.5 text-muted-foreground">
              This trace has {observationCount?.toLocaleString() ?? "many"}{" "}
              observations. To keep things smooth:
            </p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-muted-foreground">
              <li>Content loads as you scroll</li>
              <li>JSON view is disabled</li>
              <li>Download/copy includes I/O for cached observations only</li>
            </ul>
          </HoverCardContent>
        </HoverCard>
      )}

      {/* Search input or spacer (hidden in JSON view) */}
      {currentView === "json" ? (
        <div className="flex-1" />
      ) : (
        <Command className="flex-1 rounded-none border-0 bg-transparent">
          <CommandInput
            showBorder={false}
            placeholder="Search observations..."
            className="h-7 border-0 focus:ring-0"
            value={searchQuery}
            onValueChange={onSearchChange}
          />
        </Command>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-0.5">
        {/* Indent Toggle - only in formatted view */}
        {currentView === "pretty" && onToggleIndent && (
          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <Button
                variant={indentEnabled ? "default" : "ghost"}
                size="icon"
                className={cn(
                  "h-7 w-7",
                  indentEnabled && "bg-primary text-primary-foreground",
                  indentDisabled && "cursor-not-allowed opacity-50",
                )}
                onClick={indentDisabled ? undefined : onToggleIndent}
                disabled={indentDisabled}
                title={
                  indentDisabled
                    ? undefined
                    : indentEnabled
                      ? "Hide indentation"
                      : "Show indentation"
                }
              >
                <IndentIncrease className="h-3.5 w-3.5" />
              </Button>
            </HoverCardTrigger>
            {indentDisabled && (
              <HoverCardContent className="w-56 text-sm" sideOffset={8}>
                <p className="font-medium">Indentation unavailable</p>
                <p className="mt-1 text-muted-foreground">
                  Disabled for deeply nested trees to maintain readability.
                </p>
              </HoverCardContent>
            )}
          </HoverCard>
        )}

        {/* Milliseconds Toggle - only in formatted view */}
        {currentView === "pretty" && onToggleMilliseconds && (
          <Button
            variant={showMilliseconds ? "default" : "ghost"}
            size="icon"
            className={cn(
              "h-7 w-7",
              showMilliseconds && "bg-primary text-primary-foreground",
            )}
            onClick={onToggleMilliseconds}
            title={showMilliseconds ? "Hide milliseconds" : "Show milliseconds"}
          >
            <Timer className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Expand/Collapse All - show disabled with tooltip when virtualized */}
        {currentView === "pretty" && onToggleExpandAll && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7",
                    isVirtualized && "cursor-not-allowed opacity-50",
                  )}
                  onClick={isVirtualized ? undefined : onToggleExpandAll}
                  disabled={isVirtualized}
                >
                  {allRowsExpanded && !isVirtualized ? (
                    <FoldVertical className="h-3.5 w-3.5" />
                  ) : (
                    <UnfoldVertical className="h-3.5 w-3.5" />
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {isVirtualized
                ? "Disabled for large traces"
                : allRowsExpanded
                  ? "Collapse all"
                  : "Expand all"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Copy JSON */}
        {onCopyJson && (
          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={isDownloadLoading ? undefined : handleCopyClick}
                    disabled={isDownloadLoading}
                  >
                    {isDownloadLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isCopied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isDownloadLoading
                    ? "Loading data..."
                    : isDownloadCacheOnly
                      ? "Copy as JSON (cache only)"
                      : "Copy as JSON"}
                </TooltipContent>
              </Tooltip>
            </HoverCardTrigger>
            {isDownloadCacheOnly && !isDownloadLoading && (
              <HoverCardContent className="w-64 text-sm" sideOffset={8}>
                <p className="font-medium">Cache-only mode</p>
                <p className="mt-1 text-muted-foreground">
                  For large traces, only expanded observations include full I/O
                  data.
                </p>
                {loadedObservationCount !== undefined &&
                  observationCount !== undefined && (
                    <p className="mt-1.5 text-muted-foreground">
                      <span className="font-medium">
                        {loadedObservationCount} of {observationCount}
                      </span>{" "}
                      observations loaded
                    </p>
                  )}
              </HoverCardContent>
            )}
          </HoverCard>
        )}

        {/* Download JSON */}
        {onDownloadJson && (
          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={isDownloadLoading ? undefined : onDownloadJson}
                    disabled={isDownloadLoading}
                  >
                    {isDownloadLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isDownloadLoading
                    ? "Loading data..."
                    : isDownloadCacheOnly
                      ? "Download as JSON (cache only)"
                      : "Download as JSON"}
                </TooltipContent>
              </Tooltip>
            </HoverCardTrigger>
            {isDownloadCacheOnly && !isDownloadLoading && (
              <HoverCardContent className="w-64 text-sm" sideOffset={8}>
                <p className="font-medium">Cache-only mode</p>
                <p className="mt-1 text-muted-foreground">
                  For large traces, only expanded observations include full I/O
                  data.
                </p>
                {loadedObservationCount !== undefined &&
                  observationCount !== undefined && (
                    <p className="mt-1.5 text-muted-foreground">
                      <span className="font-medium">
                        {loadedObservationCount} of {observationCount}
                      </span>{" "}
                      observations loaded
                    </p>
                  )}
              </HoverCardContent>
            )}
          </HoverCard>
        )}
      </div>
    </div>
  );
});
