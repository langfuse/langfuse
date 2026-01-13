/**
 * JSONTableView Types
 *
 * Generic types for the JSONTableView component - a domain-agnostic
 * virtualized table with customizable columns.
 */

import { type ReactNode } from "react";

/**
 * Column definition for JSONTableView.
 * @template T - The type of items in the table
 */
export interface JSONTableViewColumn<T> {
  /** Unique key for the column */
  key: string;
  /** Header content - string or ReactNode */
  header: string | ReactNode;
  /** Tailwind width class (e.g., "w-20", "flex-1", "w-16") */
  width?: string;
  /** Text alignment - defaults to "left" */
  align?: "left" | "right";
  /** Render function for cell content */
  render: (item: T, index: number) => ReactNode;
}

/**
 * Props for JSONTableView component.
 * @template T - The type of items in the table
 */
export interface JSONTableViewProps<T> {
  /** Array of items to display */
  items: T[];
  /** Column definitions */
  columns: JSONTableViewColumn<T>[];
  /** Function to get unique key for each item */
  getItemKey: (item: T) => string;

  // Expandable rows (controlled/uncontrolled pattern)
  /** Enable expand/collapse functionality */
  expandable?: boolean;
  /** Render function for expanded content */
  renderExpanded?: (item: T) => ReactNode;
  /** Controlled mode: set of expanded item keys */
  expandedKeys?: Set<string>;
  /** Controlled mode: callback when expanded keys change */
  onExpandedKeysChange?: (keys: Set<string>) => void;

  // Virtualization
  /** Enable virtualization for large lists */
  virtualized?: boolean;
  /** Row height when collapsed (for virtualization estimates) */
  collapsedRowHeight?: number;
  /** Row height when expanded (for virtualization estimates) */
  expandedRowHeight?: number;
  /** Number of rows to render above and below the visible area */
  overscan?: number;

  // Sticky header
  /** Render function for sticky header showing current visible item */
  stickyHeaderContent?: (topmostItem: T | null, index: number) => ReactNode;

  // Callbacks
  /** Called when visible items change (for viewport-based prefetching) */
  onVisibleItemsChange?: (items: T[]) => void;

  // Custom row rendering
  /** Render content before columns (e.g., tree indentation) */
  renderRowPrefix?: (item: T, isExpanded: boolean) => ReactNode;

  // Styling
  /** Additional class name for the container */
  className?: string;
}

/**
 * Internal props for JSONTableViewRow component.
 */
export interface JSONTableViewRowProps<T> {
  item: T;
  /** Unique key for the item (used for ARIA attributes) */
  itemKey: string;
  index: number;
  columns: JSONTableViewColumn<T>[];
  isExpanded: boolean;
  expandable: boolean;
  onToggle: () => void;
  renderExpanded?: (item: T) => ReactNode;
  renderRowPrefix?: (item: T, isExpanded: boolean) => ReactNode;
}

/**
 * Internal props for JSONTableViewHeader component.
 */
export interface JSONTableViewHeaderProps<T> {
  columns: JSONTableViewColumn<T>[];
  hasExpandIcon: boolean;
}
