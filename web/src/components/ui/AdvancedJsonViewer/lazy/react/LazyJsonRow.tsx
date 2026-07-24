/**
 * LazyJsonRow — a single visible line of the lazy JSON viewer. View-only: it
 * receives one `JsonRow` plus stable callbacks and renders; it owns no state,
 * runs no effects, and fetches nothing. All logic lives in the store
 * (LFE-11080).
 */

import React from "react";
import { ChevronRight, Copy, Loader2 } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { JsonNodeType, JsonRow } from "../rowModel";

const INDENT_PX = 14;
// Past this nesting level the indent stops growing, so a very deep chain stays
// readable instead of pushing every value off the right edge (same failure mode
// as the deep-trace layout collapse, LFE-10959). The tree is still conveyed by
// the chevrons and keys; only the horizontal offset is capped.
const MAX_VISUAL_DEPTH = 24;

/** Tailwind text color per JSON scalar type (containers use the muted key color). */
const TYPE_CLASS: Record<JsonNodeType, string> = {
  string: "text-green-700 dark:text-green-400",
  number: "text-blue-700 dark:text-blue-400",
  boolean: "text-purple-700 dark:text-purple-400",
  null: "text-muted-foreground",
  object: "text-foreground",
  array: "text-foreground",
};

export interface LazyJsonRowProps {
  row: JsonRow;
  /** True while this node has an in-flight expand/collapse/load-more. */
  pending?: boolean;
  onToggle: (nodeId: number, currentlyExpanded: boolean) => void;
  onLoadMore: (loadMoreId: number) => void;
  onCopyValue: (nodeId: number) => void;
}

function keyLabel(keyOrIndex: string | number | null): string | null {
  if (keyOrIndex === null) return null;
  return typeof keyOrIndex === "number" ? `${keyOrIndex}` : keyOrIndex;
}

function LazyJsonRowImpl({
  row,
  pending = false,
  onToggle,
  onLoadMore,
  onCopyValue,
}: LazyJsonRowProps) {
  const paddingLeft = Math.min(row.depth, MAX_VISUAL_DEPTH) * INDENT_PX;

  // Synthetic "reveal next page" row for a paginated wide container.
  if (row.isLoadMore) {
    return (
      <div
        className="flex h-full items-center gap-1 font-mono text-xs"
        style={{ paddingLeft: paddingLeft + INDENT_PX }}
      >
        <button
          type="button"
          disabled={pending}
          className="text-muted-foreground hover:text-foreground rounded px-1 underline decoration-dotted underline-offset-2 disabled:opacity-60"
          onClick={() => onLoadMore(row.nodeId)}
        >
          {row.preview}
        </button>
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      </div>
    );
  }

  const label = keyLabel(row.keyOrIndex);
  const isContainer = row.expandable;

  return (
    <div
      className="hover:bg-muted/50 group flex h-full items-center gap-1 font-mono text-xs"
      style={{ paddingLeft }}
    >
      {/* Chevron gutter — reserved even for leaves so keys align by depth. */}
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {isContainer ? (
          pending ? (
            <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
          ) : (
            <button
              type="button"
              aria-label={row.expanded ? "Collapse" : "Expand"}
              className="text-muted-foreground hover:text-foreground flex h-4 w-4 items-center justify-center"
              onClick={() => onToggle(row.nodeId, row.expanded)}
            >
              <ChevronRight
                className={cn(
                  "h-3 w-3 transition-transform",
                  row.expanded && "rotate-90",
                )}
              />
            </button>
          )
        ) : null}
      </span>

      {label !== null ? (
        <span className="text-muted-foreground shrink-0">
          {label}
          <span className="opacity-60">:</span>
        </span>
      ) : null}

      {isContainer ? (
        <span className="text-muted-foreground truncate" title={row.preview}>
          {row.preview}
          {typeof row.childCount === "number" ? (
            <span className="ml-1 opacity-60">
              {row.type === "array"
                ? `[${row.childCount}]`
                : `{${row.childCount}}`}
            </span>
          ) : null}
        </span>
      ) : (
        <span
          className={cn("truncate", TYPE_CLASS[row.type])}
          title={row.preview}
        >
          {row.preview}
          {row.truncatedPreview ? (
            <span className="text-muted-foreground opacity-60">…</span>
          ) : null}
        </span>
      )}

      {/* Copy-full-value: for a truncated leaf the preview is not the whole
          value, so offer to materialize + copy it on demand (never rendered
          inline — that is the freeze we are avoiding). */}
      {!isContainer && row.truncatedPreview ? (
        <button
          type="button"
          aria-label="Copy full value"
          title="Copy full value"
          className="text-muted-foreground hover:text-foreground ml-1 shrink-0 opacity-0 group-hover:opacity-100"
          onClick={() => onCopyValue(row.nodeId)}
        >
          <Copy className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Memoized: scrolling re-renders the virtualizer, but a row whose `row` object
 * and callbacks are unchanged (guaranteed within a revision by the store) must
 * not re-render. Callbacks are stable (bound to the store in the list).
 */
export const LazyJsonRow = React.memo(LazyJsonRowImpl);
