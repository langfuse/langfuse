/**
 * LogViewToolbar - Controls for log view mode, tree style, and search.
 *
 * Provides:
 * - Mode toggle: chronological vs tree-order
 * - Tree style toggle: flat vs indented (only in tree-order mode)
 * - Search input for filtering observations
 */

import { memo } from "react";
import {
  Clock,
  GitBranch,
  List,
  Indent,
  Search,
  X,
  FoldVertical,
  UnfoldVertical,
  Copy,
  Download,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";
import {
  type LogViewMode,
  type LogViewTreeStyle,
} from "@/src/components/trace2/contexts/ViewPreferencesContext";

export interface LogViewToolbarProps {
  /** Current view mode */
  mode: LogViewMode;
  /** Callback when mode changes */
  onModeChange: (mode: LogViewMode) => void;
  /** Current tree style */
  treeStyle: LogViewTreeStyle;
  /** Callback when tree style changes */
  onTreeStyleChange: (style: LogViewTreeStyle) => void;
  /** Current search query */
  searchQuery: string;
  /** Callback when search query changes */
  onSearchChange: (query: string) => void;
  /** Total number of items */
  totalCount: number;
  /** Number of filtered items (when search is active) */
  filteredCount?: number;
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
}

/**
 * Toolbar for log view controls.
 */
export const LogViewToolbar = memo(function LogViewToolbar({
  mode,
  onModeChange,
  treeStyle,
  onTreeStyleChange,
  searchQuery,
  onSearchChange,
  totalCount,
  filteredCount,
  isVirtualized = true,
  onToggleExpandAll,
  allRowsExpanded,
  onCopyJson,
  onDownloadJson,
  currentView = "pretty",
}: LogViewToolbarProps) {
  const isFiltered = searchQuery.trim().length > 0;
  const showFilteredCount = isFiltered && filteredCount !== undefined;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-2">
      {/* Mode toggle */}
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center rounded-md border border-border">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 rounded-r-none px-2",
                  mode === "chronological" && "bg-muted",
                )}
                onClick={() => onModeChange("chronological")}
              >
                <Clock className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Chronological order (by start time)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 rounded-l-none px-2",
                  mode === "tree-order" && "bg-muted",
                )}
                onClick={() => onModeChange("tree-order")}
              >
                <GitBranch className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Tree order (parent-child hierarchy)</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Tree style toggle (only visible in tree-order mode) */}
        {mode === "tree-order" && (
          <div className="flex items-center rounded-md border border-border">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 rounded-r-none px-2",
                    treeStyle === "flat" && "bg-muted",
                  )}
                  onClick={() => onTreeStyleChange("flat")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Flat list with depth indicator</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 rounded-l-none px-2",
                    treeStyle === "indented" && "bg-muted",
                  )}
                  onClick={() => onTreeStyleChange("indented")}
                >
                  <Indent className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Indented tree view</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </TooltipProvider>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {/* Expand/Collapse All - only in non-virtualized table mode */}
        {!isVirtualized && currentView === "pretty" && onToggleExpandAll && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={onToggleExpandAll}
              >
                {allRowsExpanded ? (
                  <FoldVertical className="h-4 w-4" />
                ) : (
                  <UnfoldVertical className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{allRowsExpanded ? "Collapse all" : "Expand all"}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Copy JSON */}
        {onCopyJson && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={onCopyJson}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Copy as JSON</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Download JSON */}
        {onDownloadJson && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={onDownloadJson}
              >
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Download as JSON</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Search input */}
      <div className="relative w-64">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search observations..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 pl-8 pr-8 text-sm"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
            onClick={() => onSearchChange("")}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Count indicator */}
      <span className="text-xs text-muted-foreground">
        {showFilteredCount
          ? `${filteredCount} / ${totalCount}`
          : `${totalCount} observations`}
      </span>

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
    </div>
  );
});
