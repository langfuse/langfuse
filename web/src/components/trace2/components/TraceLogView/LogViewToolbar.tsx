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
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Command, CommandInput } from "@/src/components/ui/command";
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
  /** Callback to toggle indent visualization */
  onToggleIndent?: () => void;
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
  onToggleIndent,
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
            )}
            onClick={onToggleIndent}
            title={indentEnabled ? "Hide indentation" : "Show indentation"}
          >
            <IndentIncrease className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Expand/Collapse All - only in non-virtualized table mode */}
        {!isVirtualized && currentView === "pretty" && onToggleExpandAll && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onToggleExpandAll}
            title={allRowsExpanded ? "Collapse all" : "Expand all"}
          >
            {allRowsExpanded ? (
              <FoldVertical className="h-3.5 w-3.5" />
            ) : (
              <UnfoldVertical className="h-3.5 w-3.5" />
            )}
          </Button>
        )}

        {/* Copy JSON */}
        {onCopyJson && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopyClick}
            title="Copy as JSON"
          >
            {isCopied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        )}

        {/* Download JSON */}
        {onDownloadJson && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onDownloadJson}
            title="Download as JSON"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
});
