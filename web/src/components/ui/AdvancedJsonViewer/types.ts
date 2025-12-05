/**
 * Type definitions for AdvancedJsonViewer
 *
 * All TypeScript interfaces and types used throughout the component.
 * Self-contained with no external dependencies.
 */

import type { RefObject } from "react";

// ============================================================================
// JSON Value Types
// ============================================================================

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONObject
  | JSONArray;

export interface JSONObject {
  [key: string]: JSONValue;
}

export interface JSONArray extends Array<JSONValue> {}

export type JSONType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined"
  | "object"
  | "array";

// ============================================================================
// Flat Row Structure
// ============================================================================

/**
 * Represents a single row in the flattened JSON tree
 */
export interface FlatJSONRow {
  /** Unique identifier for this row (dot-separated path: "root.users.0.name") */
  id: string;

  /** Nesting depth (0 = root) */
  depth: number;

  /** Property name or array index */
  key: string | number;

  /** The actual value at this path */
  value: unknown;

  /** Detected JSON type */
  type: JSONType;

  /** Whether this row can be expanded (has children) */
  isExpandable: boolean;

  /** Whether this row is currently expanded */
  isExpanded: boolean;

  /** Parent row ID (null for root) */
  parentId: string | null;

  /** Number of children (for preview text) */
  childCount?: number;

  /** Position among siblings (for rendering) */
  indexInParent: number;

  /** Whether this is the last child of its parent (for tree lines) */
  isLastChild: boolean;

  /** Path array for easy traversal */
  pathArray: (string | number)[];
}

// ============================================================================
// Expansion State
// ============================================================================

/**
 * Expansion state can be:
 * - boolean: true = expand all, false = collapse all
 * - Record: per-path expansion state (e.g., { "root.users.0": true })
 */
export type ExpansionState = Record<string, boolean> | boolean;

// ============================================================================
// Search
// ============================================================================

/**
 * Represents a search match in the JSON tree
 */
export interface SearchMatch {
  /** Index in the flat row array */
  rowIndex: number;

  /** Row ID (same as FlatJSONRow.id) */
  rowId: string;

  /** Where the match was found */
  matchType: "key" | "value";

  /** Start position of match in the text (for substring highlighting) */
  highlightStart?: number;

  /** End position of match in the text */
  highlightEnd?: number;

  /** The matched text for reference */
  matchedText?: string;
}

/**
 * Search options
 */
export interface SearchOptions {
  /** Case-sensitive search */
  caseSensitive?: boolean;

  /** Match whole words only */
  wholeWord?: boolean;

  /** Use regular expressions */
  useRegex?: boolean;
}

// ============================================================================
// Theme
// ============================================================================

/**
 * Theme configuration for JSON viewer
 * All colors can be CSS color strings or CSS variables
 */
export interface JSONTheme {
  // Background colors
  background: string;
  foreground: string;

  // Syntax colors
  keyColor: string;
  stringColor: string;
  numberColor: string;
  booleanColor: string;
  nullColor: string;
  punctuationColor: string;

  // UI element colors
  lineNumberColor: string;
  expandButtonColor: string;
  copyButtonColor: string;

  // State colors
  hoverBackground: string;
  selectedBackground: string;
  searchMatchBackground: string;
  searchCurrentBackground: string;

  // Sizes
  fontSize: string;
  lineHeight: number; // in pixels
  indentSize: number; // in pixels
}

/**
 * Partial theme for user customization
 */
export type PartialJSONTheme = Partial<JSONTheme>;

// ============================================================================
// Component Props
// ============================================================================

/**
 * Main AdvancedJsonViewer props
 */
export interface AdvancedJsonViewerProps {
  /** Data to display */
  data: unknown;

  /** Enable virtualization (default: true for >500 rows) */
  virtualized?: boolean;

  /** Theme customization */
  theme?: PartialJSONTheme;

  /** Initial expansion state */
  initialExpansion?: ExpansionState;

  /** Controlled expansion state */
  expansionState?: ExpansionState;

  /** Callback when expansion changes */
  onExpansionChange?: (state: ExpansionState) => void;

  /** Enable search functionality */
  enableSearch?: boolean;

  /** Search placeholder text */
  searchPlaceholder?: string;

  /** Controlled search query */
  searchQuery?: string;

  /** Callback when search query changes */
  onSearchQueryChange?: (query: string) => void;

  /** Controlled current match index */
  currentMatchIndex?: number;

  /** Callback when current match index changes */
  onCurrentMatchIndexChange?: (index: number) => void;

  /** Match counts per row (including descendants) for visual indicators */
  matchCounts?: Map<string, number>;

  /** Show line numbers */
  showLineNumbers?: boolean;

  /** Enable copy buttons */
  enableCopy?: boolean;

  /** Truncate strings longer than this (null = no truncation) */
  truncateStringsAt?: number | null;

  /** Enable string wrapping */
  wrapLongStrings?: boolean;

  /** Show array indices */
  showArrayIndices?: boolean;

  /** Group large arrays (threshold for grouping) */
  groupArraysAbove?: number;

  /** Custom CSS class */
  className?: string;

  /** Loading state */
  isLoading?: boolean;

  /** Error state */
  error?: Error | string;

  /** Ref to the scroll container (for proper scroll-to behavior) */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Props for JsonRow component
 */
export interface JsonRowProps {
  /** Row data */
  row: FlatJSONRow;

  /** Theme */
  theme: JSONTheme;

  /** Search match for this row (if any) */
  searchMatch?: SearchMatch;

  /** Whether this is the current search match */
  isCurrentMatch?: boolean;

  /** Number of search matches in this row and its descendants */
  matchCount?: number;

  /** Show line number */
  showLineNumber?: boolean;

  /** Line number (1-indexed) */
  lineNumber?: number;

  /** Enable copy button */
  enableCopy?: boolean;

  /** Truncate strings at this length */
  truncateStringsAt?: number | null;

  /** Wrap long strings */
  wrapLongStrings?: boolean;

  /** Callback when expand/collapse is toggled */
  onToggleExpansion?: (rowId: string) => void;

  /** Maximum number of digits for line numbers (for fixed width) */
  maxLineNumberDigits?: number;

  /** Custom CSS class */
  className?: string;
}

/**
 * Props for JsonValue component
 */
export interface JsonValueProps {
  /** Value to render */
  value: unknown;

  /** JSON type */
  type: JSONType;

  /** Theme */
  theme: JSONTheme;

  /** Whether this value is expandable (has children) */
  isExpandable?: boolean;

  /** Child count (for preview) */
  childCount?: number;

  /** Truncate strings at this length */
  truncateStringsAt?: number | null;

  /** Wrap long strings */
  wrapLongStrings?: boolean;

  /** Search highlight positions */
  highlightStart?: number;
  highlightEnd?: number;

  /** Custom CSS class */
  className?: string;
}

/**
 * Props for JsonKey component
 */
export interface JsonKeyProps {
  /** Key name or array index */
  keyName: string | number;

  /** Theme */
  theme: JSONTheme;

  /** Whether this is an array index */
  isArrayIndex?: boolean;

  /** Search highlight positions */
  highlightStart?: number;
  highlightEnd?: number;

  /** Custom CSS class */
  className?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Configuration for flattening algorithm
 */
export interface FlattenConfig {
  /** Root key name */
  rootKey?: string;

  /** Maximum depth to flatten (null = unlimited) */
  maxDepth?: number | null;

  /** Maximum number of rows (null = unlimited) */
  maxRows?: number | null;
}

/**
 * Configuration for row height estimation
 */
export interface RowHeightConfig {
  /** Base row height in pixels */
  baseHeight: number;

  /** Threshold for considering a string "long" */
  longStringThreshold: number;

  /** Characters per line for wrapped strings */
  charsPerLine: number;
}

/**
 * Result of height estimation
 */
export interface RowHeightEstimate {
  /** Estimated height in pixels */
  height: number;

  /** Whether height is dynamic (might change on render) */
  isDynamic: boolean;
}
