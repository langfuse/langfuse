/**
 * LazyJsonViewer — the in-memory entry point to the lazy JSON renderer
 * (LFE-11080).
 *
 * It owns the model lifecycle and gates render: build the async `RowModel` over
 * the given value, show a fallback until it is ready, then mount the virtualized
 * list. Everything below the seam (byte engine, tree flatten, pagination) is
 * unchanged whether the value is a small parsed object here or a ~1 GB streamed
 * payload behind a Worker later — the renderer is written once against the seam.
 *
 * The value → model build is the single effect in this feature: it is an
 * integration boundary (constructing and disposing an external async engine),
 * with a cleanup, keyed on the document. All other work is store actions driven
 * by user events, never effects.
 */

import React, { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { cn } from "@/src/utils/tailwind";
import { LazyJsonList } from "./LazyJsonList";
import { createRowModelStore } from "./rowModelStore";

export interface LazyJsonViewerProps {
  /** The already-parsed JSON value to display. */
  value: unknown;
  className?: string;
}

export function LazyJsonViewer({ value, className }: LazyJsonViewerProps) {
  // Per-mount, view-scoped store (lazy init — created once, not per render).
  const [store] = useState(createRowModelStore);

  // Build the model over `value`, and tear it down on unmount / value change.
  // This is the feature's only effect: an external-engine lifecycle boundary.
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    store.getState().init(valueRef.current);
    return () => store.getState().dispose();
    // Re-run when the document identity changes; `store` is stable.
  }, [store, value]);

  const status = useStore(store, (s) => s.status);
  const error = useStore(store, (s) => s.error);

  return (
    <div className={cn("h-full w-full", className)}>
      {status === "loading" ? (
        <div className="flex h-full items-center justify-center">
          <Spinner size="md" />
        </div>
      ) : status === "error" ? (
        <div className="text-destructive flex h-full items-center justify-center p-4 text-sm">
          Failed to read JSON: {error}
        </div>
      ) : (
        <LazyJsonList store={store} />
      )}
    </div>
  );
}
