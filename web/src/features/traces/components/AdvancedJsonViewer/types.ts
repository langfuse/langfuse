/**
 * Type definitions for AdvancedJsonViewer
 *
 * All TypeScript interfaces and types used throughout the component.
 */

import type { CommentRange } from "./utils/commentRanges";

// ============================================================================
// JSON Value Types
// ============================================================================

type JSONValue = string | number | boolean | null | JSONObject | JSONArray;

interface JSONObject {
  [key: string]: JSONValue;
}

interface JSONArray extends Array<JSONValue> {}

export type JSONType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined"
  | "object"
  | "array";

/**
 * String wrapping mode for long string values
 * - "nowrap": Display in one line (horizontal scroll)
 * - "truncate": Dynamically truncate based on available width (default)
 * - "wrap": Break into multiple lines, no truncation
 */
export type StringWrapMode = "nowrap" | "truncate" | "wrap";

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

  /** Absolute line number in fully expanded JSON (1-indexed) */
  absoluteLineNumber?: number;
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

  /** String wrapping mode */
  stringWrapMode?: StringWrapMode;

  /** Truncate strings at this length (for "truncate" mode) */
  truncateStringsAt?: number | null;

  /** Search highlight positions */
  highlightStart?: number;
  highlightEnd?: number;

  commentRanges?: CommentRange[];

  /** Offset of value within the row (for adjusting row-relative commentRanges to value-relative) */
  valueOffset?: number;

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

  /** Comment ranges (row-relative offsets, will be clipped to key boundaries) */
  commentRanges?: CommentRange[];

  /** Custom CSS class */
  className?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Configuration for flattening algorithm
 */
// ============================================================================
// Multi-Section Support
// ============================================================================

/**
 * Node type discriminator for multi-section trees
 */
/**
 * Section definition for MultiSectionJsonViewer
 */
export interface JsonSection {
  /** Unique identifier (for expansion state) */
  key: string;

  /** JSON data to display */
  data: unknown;

  /** Display title (shown in header). If not provided, derived from key */
  title?: string;

  /** Optional header render function (receives section context) */
  renderHeader?: (context: SectionContext) => React.ReactNode;

  /** Optional footer render function (receives section context) */
  renderFooter?: (context: SectionContext) => React.ReactNode;

  /** Section background color */
  backgroundColor?: string;

  /** Minimum height for section content (CSS value, e.g., "200px", "50vh") */
  minHeight?: string;

  /** Hide the data/key-value display, only show header/footer */
  hideData?: boolean;
}

/**
 * Context passed to header/footer components
 * Access via useSectionContext(sectionKey)
 */
export interface SectionContext {
  /** Section identifier */
  sectionKey: string;

  /** Number of visible JSON rows in this section */
  rowCount: number;

  /** Is section expanded? */
  isExpanded: boolean;

  /** Toggle section expansion */
  setExpanded: (expanded: boolean) => void;
}
