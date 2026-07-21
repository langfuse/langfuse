/**
 * LazyJsonList — the virtualized body of the lazy JSON viewer. It positions row
 * shells and reports the visible range back to the store; it owns no document
 * state. Row content comes from the store's per-revision cache (LFE-11080).
 */

import React, { useRef } from "react";
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
  const { value } = result.value;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard denied (permissions / insecure context) — nothing to do here;
    // a production caller would surface a toast.
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
  // Subscribe to revision so a structural change (which swaps `rows` for a new
  // empty Map, then refills) reliably repaints even before the refill lands.
  useStore(store, (s) => s.revision);

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
    // Scroll/resize/mount fire onChange — the external event that drives which
    // window the store must have loaded. Fetching happens here, not in render.
    onChange: (instance) => {
      const items = instance.getVirtualItems();
      if (items.length === 0) return;
      const start = items[0]!.index;
      const end = items[items.length - 1]!.index;
      store.getState().ensureRange(start, end - start + 1);
    },
  });

  const virtualItems = virtualizer.getVirtualItems();

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
