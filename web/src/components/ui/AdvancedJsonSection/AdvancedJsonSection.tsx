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

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  FoldVertical,
  UnfoldVertical,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { MarkdownJsonViewHeader } from "@/src/components/ui/MarkdownJsonView";
import { AdvancedJsonViewer } from "@/src/components/ui/AdvancedJsonViewer";
import { useJsonExpansion } from "@/src/components/trace2/contexts/JsonExpansionContext";
import { type MediaReturnType } from "@/src/features/media/validation";
import {
  type ExpansionState,
  type PartialJSONTheme,
} from "@/src/components/ui/AdvancedJsonViewer/types";
import { flattenJSON } from "@/src/components/ui/AdvancedJsonViewer/utils/flattenJson";
import { searchInRows } from "@/src/components/ui/AdvancedJsonViewer/utils/searchJson";
import { shouldVirtualize } from "@/src/components/ui/AdvancedJsonViewer/utils/estimateRowHeight";

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

  /** Max height for the JSON viewer */
  maxHeight?: string;

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

  /** Wrap long strings */
  wrapLongStrings?: boolean;

  /** Loading state */
  isLoading?: boolean;

  /** Media attachments */
  media?: MediaReturnType[];

  /** Additional control buttons in header */
  controlButtons?: React.ReactNode;
}

export function AdvancedJsonSection({
  title,
  data,
  field,
  parsedData,
  collapsed: controlledCollapsed,
  onToggleCollapse,
  maxHeight = "500px",
  backgroundColor,
  headerBackgroundColor,
  className,
  hideIfNull = false,
  enableSearch = true,
  searchPlaceholder = "Search JSON...",
  showLineNumbers = true,
  enableCopy = true,
  truncateStringsAt = 100,
  wrapLongStrings = false,
  isLoading = false,
  media: _media, // TODO: Implement media attachment support
  controlButtons,
}: AdvancedJsonSectionProps) {
  // Section collapse state (different from JSON tree expansion)
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapseControlled =
    controlledCollapsed !== undefined && onToggleCollapse !== undefined;
  const sectionCollapsed = isCollapseControlled
    ? controlledCollapsed
    : internalCollapsed;

  const handleToggleSectionCollapse = () => {
    if (isCollapseControlled) {
      onToggleCollapse();
    } else {
      setInternalCollapsed(!internalCollapsed);
    }
  };

  // Get expansion state from JsonExpansionContext
  const { expansionState: globalExpansionState, setFieldExpansion } =
    useJsonExpansion();

  // Memoize field expansion state to avoid changing on every render
  const fieldExpansionState = useMemo(
    () => globalExpansionState[field] ?? {},
    [globalExpansionState, field],
  );

  // Handle expansion state changes
  const handleExpansionChange = useCallback(
    (newExpansion: ExpansionState) => {
      setFieldExpansion(field, newExpansion);
    },
    [field, setFieldExpansion],
  );

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

  // Compute flat rows for search
  const flatRows = useMemo(() => {
    return flattenJSON(parsedData ?? data, fieldExpansionState, {
      rootKey: "root",
    });
  }, [parsedData, data, fieldExpansionState]);

  // Compute search matches
  const searchMatches = useMemo(() => {
    if (!debouncedSearchQuery || debouncedSearchQuery.trim() === "") {
      return [];
    }
    return searchInRows(flatRows, debouncedSearchQuery, {
      caseSensitive: false,
    });
  }, [flatRows, debouncedSearchQuery]);

  // Handle search navigation
  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % searchMatches.length);
  }, [searchMatches.length]);

  const handlePreviousMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIndex((prev) =>
      prev === 0 ? searchMatches.length - 1 : prev - 1,
    );
  }, [searchMatches.length]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setCurrentMatchIndex(0);
  }, []);

  // Compute row count for title display
  const rowCount = flatRows.length;

  // Determine if all nodes are collapsed/expanded for collapse/expand all button
  const allExpanded = useMemo(() => {
    if (typeof fieldExpansionState === "boolean") {
      return fieldExpansionState;
    }
    // If it's a Record, check if most paths are expanded
    const values = Object.values(fieldExpansionState);
    if (values.length === 0) return false;
    const expandedCount = values.filter(Boolean).length;
    return expandedCount > values.length / 2;
  }, [fieldExpansionState]);

  // Handle collapse/expand all
  const handleToggleExpandAll = () => {
    const newExpansion = !allExpanded;
    setFieldExpansion(field, newExpansion);
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

  // Determine if virtualization is being used (must come after customTheme)
  const isVirtualized = useMemo(() => {
    return shouldVirtualize(flatRows, {
      baseHeight: customTheme.lineHeight ?? 16,
      longStringThreshold: truncateStringsAt ?? 100,
      charsPerLine: 80,
    });
  }, [flatRows, customTheme.lineHeight, truncateStringsAt]);

  // Hide section if data is null/undefined
  if (hideIfNull && (data === null || data === undefined)) {
    return null;
  }

  return (
    <div className={`border-b border-t ${className || ""}`}>
      {/* Header with fixed height */}
      <div
        className="border-b"
        style={{
          backgroundColor: headerBackgroundColor,
          minHeight: "38px", // Fixed height for header
        }}
      >
        <MarkdownJsonViewHeader
          title={
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleSectionCollapse}
                className="inline-flex items-center justify-center rounded-sm p-0.5 transition-colors hover:bg-accent"
                aria-label={
                  sectionCollapsed ? "Expand section" : "Collapse section"
                }
              >
                {sectionCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              <span>{title}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {rowCount} rows{isVirtualized ? " (virtualized)" : ""}
              </span>
            </div>
          }
          handleOnValueChange={() => {}}
          handleOnCopy={handleCopy}
          canEnableMarkdown={false}
          controlButtons={
            <>
              {/* Search */}
              {!sectionCollapsed && enableSearch && (
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
              {!sectionCollapsed && controlButtons}

              {/* Collapse/Expand All */}
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
            </>
          }
        />
      </div>

      {/* Body */}
      {!sectionCollapsed && (
        <div
          style={{
            minHeight: "100px",
            maxHeight: maxHeight,
            overflow: "auto", // Enable scrolling
            backgroundColor: headerBackgroundColor || backgroundColor,
          }}
        >
          <AdvancedJsonViewer
            data={parsedData ?? data}
            theme={customTheme}
            expansionState={fieldExpansionState}
            onExpansionChange={handleExpansionChange}
            enableSearch={false} // Search is handled in header
            searchQuery={debouncedSearchQuery}
            onSearchQueryChange={setSearchQuery}
            currentMatchIndex={currentMatchIndex}
            onCurrentMatchIndexChange={setCurrentMatchIndex}
            showLineNumbers={showLineNumbers}
            enableCopy={enableCopy}
            truncateStringsAt={truncateStringsAt}
            wrapLongStrings={wrapLongStrings}
            isLoading={isLoading}
            className="h-full"
          />
        </div>
      )}
    </div>
  );
}
