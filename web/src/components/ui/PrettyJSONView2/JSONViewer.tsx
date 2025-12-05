/**
 * JSONViewer - Virtualized JSON tree view component
 *
 * Features:
 * - Virtualized rendering using react-obj-view (handles 100K+ nodes)
 * - Search with find-next/previous navigation
 * - Collapse/expand all
 * - Copy to clipboard
 * - Dark mode support
 * - Media attachments
 * - Loading states
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  FoldVertical,
  UnfoldVertical,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { type MediaReturnType } from "@/src/features/media/validation";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { MarkdownJsonViewHeader } from "@/src/components/ui/MarkdownJsonView";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { Input } from "@/src/components/ui/input";
import type { CSSProperties } from "react";

// Import react-obj-view base styles
import "react-obj-view/dist/react-obj-view.css";

// Styles for search highlighting
import "./json-viewer.css";

// Dynamic import to avoid SSR issues
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";

const ObjectView = dynamic(
  () => import("react-obj-view").then((mod) => mod.ObjectView),
  { ssr: false },
);

// Theme definitions for react-obj-view
// Light theme - cleaner with less color emphasis
const lightTheme: CSSProperties = {
  "--bigobjview-color": "hsl(var(--foreground))",
  "--bigobjview-bg-color": "hsl(var(--background))", // Default to standard background
  "--bigobjview-change-color": "hsl(var(--primary))",
  "--bigobjview-fontsize": "0.7rem",
  "--bigobjview-type-boolean-color": "#0550ae", // Keep blue for booleans
  "--bigobjview-type-number-color": "#0550ae", // Keep blue for numbers
  "--bigobjview-type-bigint-color": "#0550ae",
  "--bigobjview-type-string-color": "hsl(var(--foreground))", // Black-ish for strings
  "--bigobjview-type-object-array-color": "hsl(var(--muted-foreground))", // Grey
  "--bigobjview-type-object-object-color": "hsl(var(--muted-foreground))", // Grey
  "--bigobjview-type-object-promise-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-object-map-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-object-set-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-function-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-object-regexp-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-object-date-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-object-error-color": "hsl(0 84% 60%)",
  "--bigobjview-type-null-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-undefined-color": "hsl(var(--muted-foreground))",
} as CSSProperties;

// Dark theme - cleaner with less color emphasis
const darkTheme: CSSProperties = {
  "--bigobjview-color": "hsl(var(--foreground))",
  "--bigobjview-bg-color": "hsl(var(--background))", // Default to standard background
  "--bigobjview-change-color": "hsl(var(--primary))",
  "--bigobjview-fontsize": "0.7rem",
  "--bigobjview-type-boolean-color": "#539bf5", // Keep blue for booleans
  "--bigobjview-type-number-color": "#539bf5", // Keep blue for numbers
  "--bigobjview-type-bigint-color": "#539bf5",
  "--bigobjview-type-string-color": "hsl(var(--foreground))", // White-ish for strings
  "--bigobjview-type-object-array-color": "hsl(var(--muted-foreground))", // Grey
  "--bigobjview-type-object-object-color": "hsl(var(--muted-foreground))", // Grey
  "--bigobjview-type-object-promise-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-object-map-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-object-set-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-function-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-object-regexp-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-object-date-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-object-error-color": "hsl(0 84% 70%)",
  "--bigobjview-type-null-color": "hsl(var(--muted-foreground))",
  "--bigobjview-type-undefined-color": "hsl(var(--muted-foreground))",
} as CSSProperties;

// Special title styling
const ASSISTANT_TITLES = ["assistant", "Output", "model"];
const SYSTEM_TITLES = ["system", "Input"];

export interface JSONViewerProps {
  /** Data to display (any JSON-serializable value) */
  data: unknown;

  /** Optional title displayed above the viewer */
  title?: string;

  /** Hide the title even if provided */
  hideTitle?: boolean;

  /** Custom CSS classes for container */
  className?: string;

  /** Custom CSS classes for code/content area */
  codeClassName?: string;

  /** Show loading skeleton */
  isLoading?: boolean;

  /** Show parsing skeleton (progressive rendering) */
  isParsing?: boolean;

  /** Media attachments to display below JSON */
  media?: MediaReturnType[];

  /** Enable scrollable container */
  scrollable?: boolean;

  /** Collapse all nodes */
  collapsed?: boolean;

  /** Callback when collapse state changes */
  onToggleCollapse?: () => void;

  /** Maximum string length before truncation (null = no limit) */
  collapseStringsAfterLength?: number | null;

  /** Enable search functionality */
  enableSearch?: boolean;

  /** Placeholder text for search input */
  searchPlaceholder?: string;

  /** Additional control buttons to display in header */
  controlButtons?: React.ReactNode;

  /** Background color for the JSON viewer (defaults to parent container background) */
  backgroundColor?: string;
}

interface SearchMatch {
  path: string[]; // Path to the matched node (e.g., ["users", "0", "name"])
  pathString: string; // Path as dot-separated string for easier comparison
  key: string; // The key that matched
  value: unknown; // The value at this path
  matchInKey: boolean; // Whether match was in key or value
  query: string; // The original search query
  depth: number; // Nesting depth of the matched node (for expansion calculation)
}

/**
 * SearchBar component for JSON search
 */
function SearchBar({
  onSearch,
  matches,
  currentIndex,
  onNext,
  onPrevious,
  onClear,
  placeholder = "Search...",
}: {
  onSearch: (query: string) => void;
  matches: SearchMatch[];
  currentIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  onClear: () => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, onSearch]);

  const handleClear = () => {
    setQuery("");
    onClear();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && matches.length > 0) {
      e.preventDefault();
      onNext();
    }
  };

  return (
    <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-0.5">
      <Input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-5 w-32 border-none bg-transparent px-1 text-xs focus-visible:ring-0"
      />
      <span
        className={cn(
          "min-w-[70px] text-right text-xs text-muted-foreground transition-opacity",
          query ? "opacity-100" : "opacity-0",
        )}
      >
        {matches.length > 0
          ? `${currentIndex + 1} of ${matches.length}`
          : "No matches"}
      </span>
      <div
        className={cn(
          "flex gap-0.5 transition-opacity",
          query ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onPrevious}
          disabled={matches.length === 0}
          title="Previous match"
        >
          <ChevronUp className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onNext}
          disabled={matches.length === 0}
          title="Next match"
        >
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleClear}
        title="Clear search"
        className={cn(
          "transition-opacity",
          query ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

/**
 * Recursively search JSON tree for matches
 */
function searchJSON(
  data: unknown,
  query: string,
  path: string[] = [],
): SearchMatch[] {
  if (!query || query.trim() === "") return [];

  const matches: SearchMatch[] = [];
  const lowerQuery = query.toLowerCase();

  function traverse(obj: unknown, currentPath: string[]) {
    if (obj === null || obj === undefined) return;

    // Search in object keys and values
    if (typeof obj === "object" && !Array.isArray(obj)) {
      Object.entries(obj as Record<string, unknown>).forEach(([key, value]) => {
        const newPath = [...currentPath, key];
        const pathString = newPath.join(".");

        // Check if key matches
        if (key.toLowerCase().includes(lowerQuery)) {
          matches.push({
            path: newPath,
            pathString,
            key,
            value,
            matchInKey: true,
            query,
            depth: newPath.length,
          });
        }

        // Check if value matches (for primitive values)
        if (
          typeof value === "string" &&
          value.toLowerCase().includes(lowerQuery)
        ) {
          matches.push({
            path: newPath,
            pathString,
            key,
            value,
            matchInKey: false,
            query,
            depth: newPath.length,
          });
        } else if (
          typeof value === "number" &&
          value.toString().includes(query)
        ) {
          matches.push({
            path: newPath,
            pathString,
            key,
            value,
            matchInKey: false,
            query,
            depth: newPath.length,
          });
        } else if (
          typeof value === "boolean" &&
          value.toString().toLowerCase().includes(lowerQuery)
        ) {
          matches.push({
            path: newPath,
            pathString,
            key,
            value,
            matchInKey: false,
            query,
            depth: newPath.length,
          });
        }

        // Recurse into nested objects/arrays
        if (typeof value === "object" && value !== null) {
          traverse(value, newPath);
        }
      });
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        const newPath = [...currentPath, index.toString()];
        const pathString = newPath.join(".");

        // Check if item matches (for primitive values)
        if (
          typeof item === "string" &&
          item.toLowerCase().includes(lowerQuery)
        ) {
          matches.push({
            path: newPath,
            pathString,
            key: index.toString(),
            value: item,
            matchInKey: false,
            query,
            depth: newPath.length,
          });
        } else if (
          typeof item === "number" &&
          item.toString().includes(query)
        ) {
          matches.push({
            path: newPath,
            pathString,
            key: index.toString(),
            value: item,
            matchInKey: false,
            query,
            depth: newPath.length,
          });
        } else if (
          typeof item === "boolean" &&
          item.toString().toLowerCase().includes(lowerQuery)
        ) {
          matches.push({
            path: newPath,
            pathString,
            key: index.toString(),
            value: item,
            matchInKey: false,
            query,
            depth: newPath.length,
          });
        }

        // Recurse into nested objects/arrays
        if (typeof item === "object" && item !== null) {
          traverse(item, newPath);
        }
      });
    }
  }

  traverse(data, path);
  return matches;
}

/**
 * JSONViewer component with virtualization and search
 */
export function JSONViewer({
  data,
  title,
  hideTitle = false,
  className,
  codeClassName,
  isLoading = false,
  isParsing = false,
  media,
  scrollable = false,
  collapsed = false,
  onToggleCollapse,
  collapseStringsAfterLength: _collapseStringsAfterLength,
  enableSearch = false,
  searchPlaceholder = "Search...",
  controlButtons,
  backgroundColor,
}: JSONViewerProps) {
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [internalCollapsed, setInternalCollapsed] = useState(collapsed);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  // Sync internal collapsed state with prop
  useEffect(() => {
    setInternalCollapsed(collapsed);
  }, [collapsed]);

  // Handle copy to clipboard
  const handleCopy = useCallback(
    (event?: React.MouseEvent<HTMLButtonElement>) => {
      if (event) {
        event.preventDefault();
      }

      const textToCopy =
        typeof data === "string" ? data : JSON.stringify(data, null, 2);

      void copyTextToClipboard(textToCopy);

      if (event) {
        event.currentTarget.focus();
      }
    },
    [data],
  );

  // Handle collapse toggle
  const handleToggleCollapse = useCallback(() => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed(!internalCollapsed);
    }
  }, [onToggleCollapse, internalCollapsed]);

  // Handle search
  const handleSearch = useCallback(
    (query: string) => {
      const matches = searchJSON(data, query);
      setSearchMatches(matches);
      setCurrentMatchIndex(0);

      // Auto-expand to show matches
      if (matches.length > 0) {
        // Uncollapse if currently collapsed
        if (internalCollapsed) {
          setInternalCollapsed(false);
        }

        // Find the deepest match depth and expand accordingly
        const maxDepth = Math.max(...matches.map((m) => m.depth));
        // The search automatically keeps things expanded via the expandLevel calculation below
      }
    },
    [data, internalCollapsed],
  );

  // Scroll to match in DOM with multi-frame animation for virtualization
  const scrollToMatch = useCallback(
    (match: SearchMatch) => {
      if (!containerRef.current) return;

      const scrollContainer =
        containerRef.current.querySelector(".overflow-y-auto");
      if (!scrollContainer) return;

      // Helper function to find the matching row in the current DOM
      const findMatchingRow = (): Element | null => {
        const rowElements =
          containerRef.current?.querySelectorAll(".row") ?? [];

        for (const row of rowElements) {
          const nameEl = row.querySelector(".name");
          const valueEl = row.querySelector(".value");

          const textContent = match.matchInKey
            ? nameEl?.textContent
            : valueEl?.textContent;

          if (textContent?.toLowerCase().includes(match.query.toLowerCase())) {
            return row;
          }
        }
        return null;
      };

      // Try to find the row immediately (it might already be rendered)
      let targetRow = findMatchingRow();

      if (targetRow) {
        // Row is already rendered, just scroll to it
        targetRow.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        // Re-apply highlights after scrolling
        setTimeout(() => applyHighlights(), 300);
      } else {
        // Row is not rendered yet - estimate scroll position and wait for virtualization
        // Estimate based on match index in searchMatches array
        const matchIndex = searchMatches.indexOf(match);
        const totalMatches = searchMatches.length;

        // Rough estimate: scroll proportionally through the content
        // This will trigger virtualization to render rows near the match
        const estimatedScrollPercent = matchIndex / Math.max(totalMatches, 1);
        const maxScroll =
          scrollContainer.scrollHeight - scrollContainer.clientHeight;
        const estimatedScroll = maxScroll * estimatedScrollPercent;

        // Scroll to estimated position
        scrollContainer.scrollTo({
          top: estimatedScroll,
          behavior: "smooth",
        });

        // Wait for virtualization to render, then try to find and scroll to exact row
        const attemptFindRow = (attempts = 0) => {
          if (attempts > 10) return; // Give up after 10 attempts

          setTimeout(
            () => {
              targetRow = findMatchingRow();
              if (targetRow) {
                targetRow.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
                applyHighlights();
              } else {
                // Try again
                attemptFindRow(attempts + 1);
              }
            },
            100 * (attempts + 1),
          ); // Increasing delay for each attempt
        };

        attemptFindRow();
      }
    },
    [searchMatches, applyHighlights],
  );

  // Navigate to next match
  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIndex);
    scrollToMatch(searchMatches[nextIndex]!);
  }, [searchMatches, currentMatchIndex, scrollToMatch]);

  // Navigate to previous match
  const handlePreviousMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const prevIndex =
      currentMatchIndex === 0
        ? searchMatches.length - 1
        : currentMatchIndex - 1;
    setCurrentMatchIndex(prevIndex);
    scrollToMatch(searchMatches[prevIndex]!);
  }, [searchMatches, currentMatchIndex, scrollToMatch]);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchMatches([]);
    setCurrentMatchIndex(0);
  }, []);

  // Apply highlights to visible rows
  const applyHighlights = useCallback(() => {
    if (!containerRef.current) return;

    // Always clear previous highlights first
    const previousHighlights = containerRef.current.querySelectorAll(
      ".search-match, .search-match-current",
    );
    previousHighlights.forEach((el) => {
      el.classList.remove("search-match", "search-match-current");
    });

    // If no matches, just clear and return
    if (searchMatches.length === 0) return;

    // Track which rows we've already highlighted to avoid duplicates
    const highlightedRows = new Set<Element>();

    // Highlight all matches by highlighting their entire row containers
    searchMatches.forEach((match, matchIndex) => {
      // Only search in the appropriate elements based on where the match was found
      const elementsToSearch = match.matchInKey
        ? Array.from(containerRef.current?.querySelectorAll(".name") ?? [])
        : Array.from(containerRef.current?.querySelectorAll(".value") ?? []);

      for (const el of elementsToSearch) {
        const textContent = el.textContent ?? "";

        // Match the query in the text content (case-insensitive)
        if (textContent.toLowerCase().includes(match.query.toLowerCase())) {
          // Find the parent row container
          const rowContainer = el.closest(".row");

          if (rowContainer && !highlightedRows.has(rowContainer)) {
            rowContainer.classList.add("search-match");
            if (matchIndex === currentMatchIndex) {
              rowContainer.classList.add("search-match-current");
            }
            highlightedRows.add(rowContainer);
            break; // Only highlight one row per match
          }
        }
      }
    });
  }, [searchMatches, currentMatchIndex]);

  // Highlight matches in DOM after render and on scroll (for virtualization)
  useEffect(() => {
    applyHighlights();
  }, [applyHighlights]);

  // Re-apply highlights when scrolling (for newly virtualized rows)
  useEffect(() => {
    if (!containerRef.current || searchMatches.length === 0) return;

    const scrollContainer =
      containerRef.current.querySelector(".overflow-y-auto");
    if (!scrollContainer) return;

    // Throttle scroll events to avoid performance issues
    let timeoutId: NodeJS.Timeout | null = null;
    const handleScroll = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        applyHighlights();
      }, 100);
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [searchMatches, applyHighlights]);

  // Memoize valueGetter for react-obj-view (required for performance)
  const valueGetter = useMemo(() => () => data, [data]);

  // Calculate row count for display
  const rowCount = useMemo(() => {
    const countRows = (obj: unknown): number => {
      if (obj === null || obj === undefined) return 1;
      if (typeof obj !== "object") return 1;

      let count = 1; // Count the current object/array itself

      if (Array.isArray(obj)) {
        obj.forEach((item) => {
          count += countRows(item);
        });
      } else {
        Object.values(obj as Record<string, unknown>).forEach((value) => {
          count += countRows(value);
        });
      }

      return count;
    };

    return countRows(data);
  }, [data]);

  // Select theme based on current mode and merge background color
  const currentTheme = useMemo(() => {
    const baseTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;

    // Determine background color: custom prop > title-based > default
    let bgColor = backgroundColor;

    if (!bgColor) {
      // Auto-detect background based on title to match container
      if (ASSISTANT_TITLES.includes(title || "")) {
        bgColor = "hsl(var(--accent-light-green))";
      } else if (SYSTEM_TITLES.includes(title || "")) {
        bgColor = "hsl(var(--primary-foreground))";
      }
    }

    if (bgColor) {
      return {
        ...baseTheme,
        "--bigobjview-bg-color": bgColor,
      } as CSSProperties;
    }

    return baseTheme;
  }, [resolvedTheme, backgroundColor, title]);

  // Determine expansion level based on collapsed state
  // When searching, expand to show all matches
  const effectiveCollapsed = onToggleCollapse ? collapsed : internalCollapsed;
  const expandLevel = effectiveCollapsed
    ? 0
    : searchMatches.length > 0
      ? Math.max(10, Math.max(...searchMatches.map((m) => m.depth)) + 1) // Expand deep enough to show all matches
      : 3; // Default to 3 levels deep when expanded

  // Container classes
  const containerClasses = cn(
    "io-message-content whitespace-pre-wrap break-words p-3 text-xs",
    ASSISTANT_TITLES.includes(title || "")
      ? "bg-accent-light-green dark:border-accent-dark-green"
      : "",
    SYSTEM_TITLES.includes(title || "") ? "bg-primary-foreground" : "",
    codeClassName,
  );

  // Loading skeleton
  if (isLoading || isParsing) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        {title && !hideTitle && (
          <div className="text-sm font-medium">{title}</div>
        )}
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const body = (
    <>
      <div className={containerClasses} ref={containerRef}>
        <ObjectView
          valueGetter={valueGetter}
          expandLevel={expandLevel}
          showLineNumbers={false}
          lineHeight={16}
          style={{
            ...currentTheme,
            height: scrollable ? "100%" : "auto",
          }}
          className="w-full"
        />
      </div>

      {/* Media section */}
      {media && media.length > 0 && (
        <>
          <div className="mx-3 border-t px-2 py-1 text-xs text-muted-foreground">
            Media
          </div>
          <div className="flex flex-wrap gap-2 p-4 pt-1">
            {media.map((m) => (
              <LangfuseMediaView
                mediaAPIReturnValue={m}
                asFileIcon={true}
                key={m.mediaId}
              />
            ))}
          </div>
        </>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "flex max-h-full min-h-0 flex-col",
        className,
        scrollable ? "overflow-hidden" : "",
      )}
    >
      {/* Header */}
      {title && !hideTitle ? (
        <div className={cn(scrollable && "sticky top-0 z-10 bg-background")}>
          <MarkdownJsonViewHeader
            title={
              <div className="flex items-center gap-2">
                <span>{title}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {rowCount} rows
                </span>
              </div>
            }
            canEnableMarkdown={false}
            handleOnValueChange={() => {}}
            handleOnCopy={handleCopy}
            controlButtons={
              <>
                {/* Search */}
                {enableSearch && (
                  <SearchBar
                    onSearch={handleSearch}
                    matches={searchMatches}
                    currentIndex={currentMatchIndex}
                    onNext={handleNextMatch}
                    onPrevious={handlePreviousMatch}
                    onClear={handleClearSearch}
                    placeholder={searchPlaceholder}
                  />
                )}

                {/* Custom control buttons */}
                {controlButtons}

                {/* Collapse/Expand All */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleToggleCollapse}
                  className="-mr-2 hover:bg-border"
                  disabled={searchMatches.length > 0}
                  title={
                    searchMatches.length > 0
                      ? "Clear search to collapse"
                      : effectiveCollapsed
                        ? "Expand all"
                        : "Collapse all"
                  }
                >
                  {effectiveCollapsed ? (
                    <UnfoldVertical className="h-3 w-3" />
                  ) : (
                    <FoldVertical className="h-3 w-3" />
                  )}
                </Button>
              </>
            }
          />
        </div>
      ) : null}

      {/* Body */}
      {scrollable ? (
        <div className="flex h-full min-h-0 overflow-hidden">
          <div className="max-h-full min-h-0 w-full overflow-y-auto">
            {body}
          </div>
        </div>
      ) : (
        body
      )}
    </div>
  );
}
