/**
 * LogViewToolbar - Controls for log view search and actions.
 *
 * Provides:
 * - Search input for filtering observations (hidden in JSON view)
 * - Action buttons: expand/collapse all, copy JSON, download JSON
 * - Virtual/Real debug indicator
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
import { cn } from "@/src/utils/tailwind";

export interface LogViewToolbarProps {
  /** Current search query */
  searchQuery: string;
  /** Callback when search query changes */
  onSearchChange: (query: string) => void;
  /** Whether virtualization is active (for debug indicator) */
  isVirtualized?: boolean;
  /** Callback to toggle expand/collapse all (non-virtualized only) */
  onToggleExpandAll?: () => void;
  /** Whether all rows are expanded */
  allRowsExpanded?: boolean;
  /** Callback to copy JSON */
  onCopyJson?: () => void;
  /** Callback to download JSON */
  onDownloadJson?: () => void;
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
  onToggleExpandAll,
  allRowsExpanded,
  onCopyJson,
  onDownloadJson,
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
      {/* Debug: Virtual indicator */}
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-xs font-medium",
          isVirtualized
            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
            : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
        )}
      >
        {isVirtualized ? "VIRTUAL" : "REAL"}
      </span>

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
                ? "Indentation disabled for deep trees"
                : indentEnabled
                  ? "Hide indentation"
                  : "Show indentation"
            }
          >
            <IndentIncrease className="h-3.5 w-3.5" />
          </Button>
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
                ? "Disabled for performance with 100+ observations"
                : allRowsExpanded
                  ? "Collapse all"
                  : "Expand all"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Copy JSON */}
        {onCopyJson && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleCopyClick}
              >
                {isCopied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy as JSON</TooltipContent>
          </Tooltip>
        )}

        {/* Download JSON */}
        {onDownloadJson && (
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
              {isDownloadLoading ? "Loading data..." : "Download as JSON"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
});
