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

import React, { useEffect, useState } from "react";
import { useStore } from "zustand";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { cn } from "@/src/utils/tailwind";
import { LazyJsonList } from "./LazyJsonList";
import { createRowModelStore, type LazyViewerMetric } from "./rowModelStore";
import { TreeRowModel } from "../treeRowModel";
import { sourceFromSerialized } from "../asyncJsonSource";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { reportError } from "@/src/utils/reportError";

// Provisional main-thread budgets (LFE-14419) — the telemetry exists to LEARN
// the right thresholds from prod, so treat these as starting guesses. An index
// or expand slower than these means our size gate let through more than the main
// thread handles comfortably.
const MAIN_THREAD_INDEX_BUDGET_MS = 1000;
const SLOW_EXPAND_BUDGET_MS = 500;

// A main-thread build blowing its budget means the size gate is miscalibrated —
// an actionable, our-code signal. This is the sentry skill's one allowed bend of
// "expected states are not events": it fires only when our heuristic was wrong,
// and is rate-limited to once per session (module scope) so it never floods.
let miscalibrationReported = false;

/** Turn the store's raw perf signals into analytics + a miscalibration alarm.
 *  Metadata only — sizes/durations/counts, never payload content. */
function handleMetric(
  capture: ReturnType<typeof usePostHogClientCapture>,
  sizeChars: number | undefined,
  metric: LazyViewerMetric,
): void {
  if (metric.kind === "indexed") {
    capture("json_viewer:indexed", {
      buildMs: Math.round(metric.buildMs),
      rowCount: metric.rowCount,
      sizeChars,
      tier: "main",
    });
    if (
      metric.buildMs > MAIN_THREAD_INDEX_BUDGET_MS &&
      !miscalibrationReported
    ) {
      miscalibrationReported = true;
      reportError(
        new Error("lazy JSON viewer: main-thread index exceeded budget"),
        {
          area: "json-viewer",
          extra: {
            buildMs: Math.round(metric.buildMs),
            sizeChars,
            rowCount: metric.rowCount,
            budgetMs: MAIN_THREAD_INDEX_BUDGET_MS,
          },
        },
      );
    }
    return;
  }
  // expand — capture only slow ones (budget-gated → naturally rare, not noise).
  if (metric.ms > SLOW_EXPAND_BUDGET_MS) {
    capture("json_viewer:slow_expand", {
      expandMs: Math.round(metric.ms),
      sizeChars,
      tier: "main",
    });
  }
}

export interface LazyJsonViewerProps {
  /**
   * The already-parsed JSON value to display. Must have a STABLE identity per
   * document: re-init (rebuild + re-index) is keyed on `value` identity, so a
   * caller that recreates it every render (inline `JSON.parse`, spread) would
   * re-index on every parent render. Memoize it, or pass a stable reference.
   * Provide EITHER `value` or `serialized`, and stick to one per mount.
   */
  value?: unknown;
  /**
   * The value's JSON serialization, when the caller already has it (e.g. a size
   * probe serialized it for a download). Feeding it here skips a redundant
   * second `JSON.stringify` of a large value. Same stable-identity contract.
   */
  serialized?: string;
  className?: string;
}

export function LazyJsonViewer({
  value,
  serialized,
  className,
}: LazyJsonViewerProps) {
  // Per-mount, view-scoped store (lazy init — created once, not per render).
  // In `serialized` mode, build the engine from the existing JSON string; the
  // document passed to init is that string (see below). `useState` reads props
  // once on mount, which is fine: a given mount is one mode.
  const usesSerialized = serialized !== undefined;
  // `capture` is a stable useCallback, so capturing it once in the store's lazy
  // initializer is safe (no stale-closure risk).
  const capture = usePostHogClientCapture();
  const [store] = useState(() => {
    const sizeChars = usesSerialized
      ? (serialized as string).length
      : undefined;
    const onMetric = (metric: LazyViewerMetric) =>
      handleMetric(capture, sizeChars, metric);
    return createRowModelStore({
      ...(usesSerialized
        ? {
            buildModel: (doc: unknown) =>
              TreeRowModel.create(sourceFromSerialized(doc as string)),
          }
        : {}),
      onMetric,
    });
  });

  // The document identity re-init keys on: the serialized string, or the value.
  const doc = usesSerialized ? serialized : value;

  // Build the model over `doc`, and tear it down on unmount / doc change.
  // This is the feature's only effect: an external-engine lifecycle boundary
  // (construct + dispose an async engine, with cleanup), keyed on the document.
  useEffect(() => {
    store.getState().init(doc);
    return () => store.getState().dispose();
    // Re-run when the document identity changes; `store` is stable.
  }, [store, doc]);

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
