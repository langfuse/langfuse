/**
 * AdvancedJsonSection - Wrapper for AdvancedJsonViewer with collapsible header
 *
 * Features:
 * - Collapsible section with header
 * - Integrated search bar in header
 * - Collapse all / expand all buttons
 * - Copy button in header
 * - JsonExpansionContext integration for state persistence
 * - Custom theme (fontSize: 0.7rem, lineHeight: 16px)
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  WrapText,
  Minus,
  ArrowRightToLine,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { AdvancedJsonSectionHeader } from "./AdvancedJsonSectionHeader";
import { AdvancedJsonViewer } from "@/src/components/ui/AdvancedJsonViewer/AdvancedJsonViewer";
import { useJsonViewPreferences } from "@/src/components/ui/AdvancedJsonViewer/hooks/useJsonViewPreferences";
import { type MediaReturnType } from "@/src/features/media/validation";
import { type PartialJSONTheme } from "@/src/components/ui/AdvancedJsonViewer/types";
import { buildTreeFromJSON } from "@/src/components/ui/AdvancedJsonViewer/utils/treeStructure";
import { searchInTree } from "@/src/components/ui/AdvancedJsonViewer/utils/searchJson";

export interface AdvancedJsonSectionProps {
  /** Section title */
  title: string;

  /** Data to display */
  data: unknown;

  /** Field name for JsonExpansionContext ("input", "output", "metadata", etc.) */
  field: string;

  /** Pre-parsed data (to avoid re-parsing) */
  parsedData?: unknown;

  /** Section collapse state (controlled) */
  collapsed?: boolean;

  /** Callback when section collapse state changes */
  onToggleCollapse?: () => void;

  /** Background color for the JSON viewer body */
  backgroundColor?: string;

  /** Background color for the header */
  headerBackgroundColor?: string;

  /** Custom CSS class */
  className?: string;

  /** Hide section if data is null/undefined */
  hideIfNull?: boolean;

  /** Enable search functionality */
  enableSearch?: boolean;

  /** Search placeholder text */
  searchPlaceholder?: string;

  /** Show line numbers */
  showLineNumbers?: boolean;

  /** Enable copy buttons */
  enableCopy?: boolean;

  /** Truncate strings longer than this */
  truncateStringsAt?: number | null;

  /** Loading state */
  isLoading?: boolean;

  /** Media attachments */
  media?: MediaReturnType[];

  /** Additional control buttons in header */
  controlButtons?: React.ReactNode;

  commentedPaths?: Map<string, Array<{ start: number; end: number }>>;

  /** Force virtualization on/off (overrides auto-detection) */
  virtualized?: boolean;
}

export function AdvancedJsonSection({
  title,
  data,
  field,
  parsedData,
  collapsed: controlledCollapsed,
  onToggleCollapse,
  backgroundColor,
  headerBackgroundColor,
  className,
  hideIfNull = false,
  enableSearch = true,
  searchPlaceholder = "Search JSON...",
  showLineNumbers = true,
  enableCopy = true,
  truncateStringsAt = 100,
  isLoading = false,
  media: _media, // TODO: Implement media attachment support
  controlButtons,
  commentedPaths,
  virtualized,
}: AdvancedJsonSectionProps) {
  // String wrap mode state (persisted in localStorage)
  const { stringWrapMode, setStringWrapMode } = useJsonViewPreferences();

  // Section collapse state (different from JSON tree expansion)
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapseControlled =
    controlledCollapsed !== undefined && onToggleCollapse !== undefined;
  const sectionCollapsed = isCollapseControlled
    ? controlledCollapsed
    : internalCollapsed;

  // When virtualized=false (continuous scroll mode), ignore collapse state - always expanded
  const effectiveCollapsed = virtualized === false ? false : sectionCollapsed;

  const handleToggleSectionCollapse = () => {
    // Don't allow toggling in non-virtualized mode
    if (virtualized === false) return;

    if (isCollapseControlled) {
      onToggleCollapse();
    } else {
      setInternalCollapsed(!internalCollapsed);
    }
  };

  // No more context - AdvancedJsonViewer handles storage directly via field prop

  // Search state (managed in this component, not in AdvancedJsonViewer)
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentMatchIndex(0); // Reset to first match when query changes
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Build tree ONCE on mount for row counting only
  // Expansion state is managed by AdvancedJsonViewer internally
  const initialTree = useMemo(() => {
    const effectiveData = parsedData ?? data;
    if (!effectiveData) {
      return null;
    }
    const tree = buildTreeFromJSON(effectiveData, {
      rootKey: "root",
      initialExpansion: true, // Fully expanded for counting
    });
    return tree;
  }, [parsedData, data]);

  // Compute total row count (when fully expanded)
  const totalRowCount = useMemo(() => {
    const count = initialTree ? initialTree.totalNodeCount : 0;
    return count;
  }, [initialTree]);

  // Compute search matches using the initial tree
  const searchMatches = useMemo(() => {
    if (
      !debouncedSearchQuery ||
      debouncedSearchQuery.trim() === "" ||
      !initialTree
    ) {
      return [];
    }
    const matches = searchInTree(initialTree, debouncedSearchQuery, {
      caseSensitive: false,
    });
    return matches;
  }, [initialTree, debouncedSearchQuery]);

  // Handle search navigation (controlled via AdvancedJsonViewer)
  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIndex);
  }, [searchMatches, currentMatchIndex]);

  const handlePreviousMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const prevIndex =
      currentMatchIndex === 0
        ? searchMatches.length - 1
        : currentMatchIndex - 1;
    setCurrentMatchIndex(prevIndex);
  }, [searchMatches, currentMatchIndex]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setCurrentMatchIndex(0);
  }, []);

  // TODO: Expand all / collapse all functionality currently disabled
  // The expandAllDescendants/collapseAllDescendants utilities cause tree offset
  // validation errors. Needs investigation into offset recalculation in treeExpansion.ts
  // before this can be re-enabled.
  //
  // Previous implementation attempted to:
  // 1. Write expansion state to storage
  // 2. Trigger tree rebuild to read new state
  // But this caused childOffsets corruption in the tree structure.

  // Handle string wrap mode cycling: truncate → wrap → nowrap → truncate
  const handleCycleWrapMode = () => {
    if (stringWrapMode === "truncate") {
      setStringWrapMode("wrap");
    } else if (stringWrapMode === "wrap") {
      setStringWrapMode("nowrap");
    } else {
      setStringWrapMode("truncate");
    }
  };

  // Handle copy
  const handleCopy = useCallback(
    (event?: React.MouseEvent<HTMLButtonElement>) => {
      event?.preventDefault();
      const jsonString = JSON.stringify(parsedData ?? data, null, 2);
      void navigator.clipboard.writeText(jsonString);
    },
    [parsedData, data],
  );

  // Custom theme for AdvancedJsonViewer
  const customTheme: PartialJSONTheme = useMemo(
    () => ({
      fontSize: "0.7rem",
      lineHeight: 16,
      indentSize: 20,
      background: headerBackgroundColor || backgroundColor || "transparent",
    }),
    [headerBackgroundColor, backgroundColor],
  );

  // Determine if virtualization is being used
  // Auto-virtualize for 500+ rows (when fully expanded)
  const isVirtualized = useMemo(() => {
    const virtualized = totalRowCount >= 500;
    return virtualized;
  }, [totalRowCount]);

  // Ref for scroll container (the body wrapper div)
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Hide section if data is null/undefined
  if (hideIfNull && (data === null || data === undefined)) {
    return null;
  }

  // If data is still being loaded/parsed, show header but not body
  const hasData = (parsedData ?? data) !== undefined;
  const effectiveData = parsedData ?? data;

  return (
    <div
      className={`flex flex-col border-b border-t ${effectiveCollapsed ? "" : virtualized !== false ? "min-h-0 overflow-hidden" : ""} ${className || ""}`}
      style={{
        backgroundColor: headerBackgroundColor || backgroundColor,
      }}
    >
      {/* Header with fixed height */}
      <div
        className="border-b"
        style={{
          backgroundColor: headerBackgroundColor,
          minHeight: "32px", // Fixed height for header
        }}
      >
        <AdvancedJsonSectionHeader
          title={
            <div className="flex items-center gap-2">
              <span>{title}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {totalRowCount} rows{isVirtualized ? " (virtualized)" : ""}
              </span>
            </div>
          }
          handleOnCopy={handleCopy}
          backgroundColor={headerBackgroundColor}
          onToggleCollapse={handleToggleSectionCollapse}
          sectionCollapsed={effectiveCollapsed}
          controlButtons={
            <>
              {/* Search */}
              {!effectiveCollapsed && enableSearch && (
                <div className="flex items-center gap-1">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder={searchPlaceholder}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (e.shiftKey) {
                            handlePreviousMatch();
                          } else {
                            handleNextMatch();
                          }
                        } else if (e.key === "Escape") {
                          handleClearSearch();
                        }
                      }}
                      className="h-6 w-[180px] pr-16 text-xs"
                      aria-label="Search JSON"
                    />
                    {searchQuery && (
                      <span
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs text-muted-foreground"
                        aria-live="polite"
                      >
                        {searchMatches.length > 0
                          ? `${currentMatchIndex + 1} of ${searchMatches.length}`
                          : "No matches"}
                      </span>
                    )}
                  </div>
                  {searchQuery && searchMatches.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={handlePreviousMatch}
                        className="inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
                        aria-label="Previous match (Shift+Enter)"
                        title="Previous match (Shift+Enter)"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={handleNextMatch}
                        className="inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
                        aria-label="Next match (Enter)"
                        title="Next match (Enter)"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Custom control buttons */}
              {!effectiveCollapsed && controlButtons}

              {/* String wrap mode toggle */}
              {!effectiveCollapsed && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleCycleWrapMode}
                  className="hover:bg-border"
                  title={
                    stringWrapMode === "truncate"
                      ? "Truncate long strings (click to wrap)"
                      : stringWrapMode === "wrap"
                        ? "Wrap long strings (click for single line)"
                        : "Single line (click to truncate)"
                  }
                >
                  {stringWrapMode === "truncate" ? (
                    <Minus className="h-3 w-3" />
                  ) : stringWrapMode === "wrap" ? (
                    <WrapText className="h-3 w-3" />
                  ) : (
                    <ArrowRightToLine className="h-3 w-3" />
                  )}
                </Button>
              )}

              {/* TODO: Collapse/Expand All button hidden - see comment above for details
              {!sectionCollapsed && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleToggleExpandAll}
                  className="-mr-2 hover:bg-border"
                  title={allExpanded ? "Collapse all" : "Expand all"}
                >
                  {allExpanded ? (
                    <FoldVertical className="h-3 w-3" />
                  ) : (
                    <UnfoldVertical className="h-3 w-3" />
                  )}
                </Button>
              )}
              */}
            </>
          }
        />
      </div>

      {/* Body */}
      {!effectiveCollapsed && (
        <div
          ref={scrollContainerRef}
          className={
            virtualized !== false
              ? "min-h-0 flex-1 overflow-auto"
              : "min-h-48 overflow-x-auto"
          }
          style={{
            backgroundColor: headerBackgroundColor || backgroundColor,
          }}
        >
          {!hasData ? (
            <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
              {isLoading ? "Loading..." : "No data"}
            </div>
          ) : (
            <AdvancedJsonViewer
              data={effectiveData}
              field={field}
              theme={customTheme}
              enableSearch={false} // Search is handled in header
              searchQuery={debouncedSearchQuery}
              onSearchQueryChange={setSearchQuery}
              currentMatchIndex={currentMatchIndex}
              onCurrentMatchIndexChange={setCurrentMatchIndex}
              showLineNumbers={showLineNumbers}
              enableCopy={enableCopy}
              stringWrapMode={stringWrapMode}
              truncateStringsAt={truncateStringsAt}
              isLoading={isLoading}
              scrollContainerRef={scrollContainerRef}
              virtualized={virtualized}
              className={virtualized !== false ? "h-full" : ""}
              commentedPaths={commentedPaths}
            />
          )}
        </div>
      )}
    </div>
  );
}
