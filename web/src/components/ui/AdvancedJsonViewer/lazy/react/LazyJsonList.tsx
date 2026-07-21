/**
 * LazyJsonList — the virtualized body of the lazy JSON viewer. It positions row
 * shells and keeps the store's loaded window in sync with the visible range; it
 * owns no document state. Row content comes from the store's per-revision cache
 * (LFE-11080).
 */

import React, { useEffect, useRef } from "react";
import { useStore } from "zustand";
import { useVirtualizer } from "@tanstack/react-virtual";
import { LazyJsonRow } from "./LazyJsonRow";
import type { RowModelStore } from "./rowModelStore";

/** Fixed single-line row height — JSON rows never wrap, so no live measurement. */
const ROW_HEIGHT = 20;

async function copyFullValue(store: RowModelStore, nodeId: number) {
  await store.getState().materialize(nodeId);
  const result = store.getState().values.get(nodeId);
  if (!result || !result.ok) return;
  const { value, truncated } = result.value;
  // When the value exceeds the engine's byte cap, `value` is the raw decoded
  // text PREFIX (not a parsed value), so emit it as-is rather than JSON-encoding
  // a partial string. (Full-payload retrieval for >cap leaves is the streamed
  // path's job, not the clipboard's.) Out-of-double integers come back as
  // bigint, which JSON.stringify cannot serialize — handle both.
  const text = truncated
    ? typeof value === "string"
      ? value
      : String(value)
    : typeof value === "string"
      ? value
      : typeof value === "bigint"
        ? value.toString()
        : safeStringify(value);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard denied (permissions / insecure context) — nothing to do here;
    // a production caller would surface a toast.
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    );
  } catch {
    return String(value);
  }
}

export interface LazyJsonListProps {
  store: RowModelStore;
  className?: string;
}

export function LazyJsonList({ store, className }: LazyJsonListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const totalVisible = useStore(store, (s) => s.totalVisible);
  const rows = useStore(store, (s) => s.rows);
  const pending = useStore(store, (s) => s.pending);
  // Subscribe to revision so a structural change (which swaps `rows` for a new
  // empty Map, then refills) reliably repaints even before the refill lands.
  const revision = useStore(store, (s) => s.revision);

  // Stable action bag — bound once to the store, so memoized rows never see a
  // changed callback identity on scroll.
  const actionsRef = useRef<{
    toggle: (nodeId: number, expanded: boolean) => void;
    loadMore: (nodeId: number) => void;
    copyValue: (nodeId: number) => void;
  } | null>(null);
  if (actionsRef.current === null) {
    actionsRef.current = {
      toggle: (nodeId, expanded) => {
        store.getState().toggle(nodeId, expanded);
      },
      loadMore: (nodeId) => {
        store.getState().loadMore(nodeId);
      },
      copyValue: (nodeId) => {
        copyFullValue(store, nodeId);
      },
    };
  }
  const actions = actionsRef.current;

  const virtualizer = useVirtualizer({
    count: totalVisible,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 40,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const firstIndex = virtualItems.length > 0 ? virtualItems[0]!.index : 0;
  const lastIndex =
    virtualItems.length > 0 ? virtualItems[virtualItems.length - 1]!.index : 0;

  // Keep the store's loaded window in sync with the virtualizer's visible range.
  // This is the windowed-loading integration boundary: it must react both to
  // SCROLL (virtual indices change) and to a structural change that GROWS the
  // range in place (revision bumps, count grows, but no scroll/resize event
  // fires — so the virtualizer's own onChange would miss it). Depending on the
  // computed range + revision covers both. `ensureRange` no-ops when the range
  // is already cached, so scroll ticks are cheap.
  useEffect(() => {
    if (totalVisible === 0) return;
    store.getState().ensureRange(firstIndex, lastIndex - firstIndex + 1);
  }, [store, firstIndex, lastIndex, revision, totalVisible]);

  return (
    <div
      ref={parentRef}
      className={className}
      style={{ height: "100%", overflow: "auto" }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => {
          const row = rows.get(virtualRow.index);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {row ? (
                <LazyJsonRow
                  row={row}
                  pending={pending.has(row.nodeId)}
                  onToggle={actions.toggle}
                  onLoadMore={actions.loadMore}
                  onCopyValue={actions.copyValue}
                />
              ) : (
                // Not yet fetched — reserve the shell; the row fills in when the
                // window resolves and the store repaints.
                <div className="h-full" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
