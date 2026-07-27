/**
 * rowModelStore — the per-mount state owner for the lazy JSON renderer
 * (LFE-11080).
 *
 * The renderer talks to a JSON document only through the async `RowModel` seam
 * (revision-stamped windows, expand/collapse/load-more, on-demand value). That
 * model is a mutable, imperative, genuinely-async system (a Worker tomorrow),
 * so per the frontend-large-feature architecture it is owned OUTSIDE React by a
 * view-scoped vanilla Zustand store:
 *
 * - The store creates and disposes the model (its lifecycle boundary).
 * - All async work (build, expand, page, materialize) lives in store actions —
 *   plain async functions, never component effects.
 * - Row views subscribe to narrow slices; the virtualizer only positions shells
 *   and reports the visible range back into `ensureRange`.
 *
 * Correctness under a REAL async source (the whole point) rests on three things:
 * - each `ensureRange` merges at ITS OWN offset (captured locally), so a slow
 *   window resolving after a later one can't land at the wrong indices;
 * - the seam's revision stamp drops a window resolved against a since-mutated
 *   model, and within one revision a visible row is immutable;
 * - structural mutations (expand/collapse/load-more) are SERIALIZED, because the
 *   model's tree mutation is not reentrant — two concurrent expands would
 *   otherwise page in the same children twice.
 */

import { createStore, type StoreApi } from "zustand/vanilla";
import { TreeRowModel } from "../treeRowModel";
import { sourceFromValue } from "../asyncJsonSource";
import type { JsonRow, RowModel, ValueResult } from "../rowModel";
import { reportError } from "@/src/utils/reportError";

/** Rows fetched for the first paint before the virtualizer reports a range. */
export const INITIAL_ROW_COUNT = 200;

export type LoadStatus = "loading" | "ready" | "error";

export interface RowModelState {
  status: LoadStatus;
  error: string | null;
  /** Mirrors the model's revision; a bump re-renders the list and its rows. */
  revision: number;
  /** Currently-visible row count — the virtualizer's item count. */
  totalVisible: number;
  /** visible-index → row, for the CURRENT revision (cleared on any mutation). */
  rows: Map<number, JsonRow>;
  /** nodeId → materialized value (lazily populated by `materialize`). */
  values: Map<number, ValueResult>;
  /** nodeIds (or load-more ids) with an in-flight structural mutation. */
  pending: Set<number>;

  /** Build the model over an in-memory value and prefetch the first window. */
  init: (value: unknown) => Promise<void>;
  /** Ensure rows for `[start, start+count)` are cached (called on scroll). */
  ensureRange: (start: number, count: number) => Promise<void>;
  /** Expand or collapse a container, then refresh the visible window. */
  toggle: (nodeId: number, currentlyExpanded: boolean) => Promise<void>;
  /** Reveal the next page of a wide container (given its load-more row id). */
  loadMore: (loadMoreId: number) => Promise<void>;
  /** Materialize one node's full value on demand (result stored in `values`).
   *  `maxBytes` overrides the engine's default cap (e.g. copy needs the whole
   *  value, not the preview-sized default). */
  materialize: (nodeId: number, maxBytes?: number) => Promise<void>;
  /** Mark the store torn down so in-flight async work no-ops on resolve. */
  dispose: () => void;
}

export type RowModelStore = StoreApi<RowModelState>;

/**
 * Perf signals the store measures and hands to the view boundary (LFE-14419).
 * The store only MEASURES; what to do with the numbers (PostHog capture, a
 * miscalibration alarm) is a telemetry policy that lives in the React boundary.
 * - `indexed`: emitted once when the first window is ready — `buildMs` is
 *   effectively time-to-first-row (build + first page) on whatever tier ran.
 * - `expand`: emitted per container expand — `ms` covers the byte engine's
 *   deferred per-container scan, i.e. the cost a wide container pays on first
 *   open. The boundary decides which are "slow" enough to report.
 */
export type LazyViewerMetric =
  | { kind: "indexed"; buildMs: number; rowCount: number }
  | { kind: "expand"; ms: number };

export interface RowModelStoreOptions {
  /**
   * How to build the model for a value. Defaults to the in-memory path
   * (stringify → byte engine → TreeRowModel). The Worker-backed model for the
   * streamed ~1 GB path will be injected here — the store and renderer do not
   * change. Also the seam tests use to drive genuinely-async / out-of-order
   * responses the in-process source cannot express.
   */
  buildModel?: (value: unknown) => Promise<RowModel>;
  /**
   * Perf-signal sink (LFE-14419). Called with timing facts; the boundary turns
   * them into analytics/alarms. No-op by default.
   */
  onMetric?: (metric: LazyViewerMetric) => void;
}

export function createRowModelStore(
  options: RowModelStoreOptions = {},
): RowModelStore {
  const buildModel =
    options.buildModel ??
    ((value: unknown) => TreeRowModel.create(sourceFromValue(value)));
  const emitMetric = options.onMetric ?? (() => {});
  // Non-reactive internals live in the factory closure, not in store state:
  // they must not trigger renders and must survive across actions.
  let model: RowModel | null = null;
  let lastStart = 0;
  let lastCount = INITIAL_ROW_COUNT;
  // Generation token. `init` (a fresh document) and `dispose` (unmount) both
  // bump it; every async continuation checks it stayed current, so work from a
  // previous document or from before teardown is abandoned on resolve. Unlike a
  // permanent "disposed" flag, this lets the SAME store be re-`init`ed when the
  // controller's value prop changes.
  let gen = 0;
  // Serializes structural mutations — see the class comment on reentrancy.
  let mutationChain: Promise<void> = Promise.resolve();

  return createStore<RowModelState>((set, get) => {
    const setPending = (id: number, on: boolean) => {
      const pending = new Set(get().pending);
      if (on) pending.add(id);
      else pending.delete(id);
      set({ pending });
    };

    /** Run a structural mutation after any in-flight one completes. */
    const serialize = (fn: () => Promise<void>): Promise<void> => {
      const next = mutationChain.then(fn, fn);
      // Keep the chain alive regardless of individual failures.
      mutationChain = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    };

    /**
     * After a structural mutation, re-read the model's cheap sync facts and
     * drop the now-stale row cache, then re-fetch the last visible window so
     * the list repaints against the new revision.
     */
    const refreshAfterMutation = async () => {
      if (!model) return;
      set({
        revision: model.getRevision(),
        totalVisible: model.getTotalVisible(),
        rows: new Map(),
      });
      await get().ensureRange(lastStart, lastCount);
    };

    /**
     * A byte-engine / model failure is an our-code failure (a malformed index /
     * unexpected shape), not an expected state — capture it and surface the
     * error UI. The per-container scan is DEFERRED until expand, so this must be
     * reachable from every mutation, not just the initial build. (skill:
     * sentry-instrumentation.)
     */
    const captureAndSetError = (e: unknown) => {
      reportError(e, { area: "json-viewer" });
      set({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    };

    return {
      status: "loading",
      error: null,
      revision: 0,
      totalVisible: 0,
      rows: new Map(),
      values: new Map(),
      pending: new Set(),

      init: async (value) => {
        const myGen = ++gen;
        model = null;
        const startedAt = performance.now();
        set({
          status: "loading",
          error: null,
          rows: new Map(),
          values: new Map(),
          pending: new Set(),
        });
        try {
          const built = await buildModel(value);
          if (gen !== myGen) return;
          model = built;
          // Publish the model's facts, but stay in "loading" until the first
          // window is fetched, so the gate never drops the spinner onto empty
          // shells under real (worker) latency.
          set({
            revision: built.getRevision(),
            totalVisible: built.getTotalVisible(),
          });
          await get().ensureRange(0, INITIAL_ROW_COUNT);
          if (gen !== myGen) return;
          set({ status: "ready" });
          // Build + first window = time-to-first-row; the boundary retunes the
          // size gate from this and alarms if it blew the main-thread budget.
          emitMetric({
            kind: "indexed",
            buildMs: performance.now() - startedAt,
            rowCount: get().totalVisible,
          });
        } catch (e) {
          if (gen !== myGen) return;
          captureAndSetError(e);
        }
      },

      ensureRange: async (start, count) => {
        if (!model) return;
        const myGen = gen;
        // Capture THIS request's window locally. `lastStart`/`lastCount` are
        // shared closure state (used to refetch after a mutation), and a
        // concurrent ensureRange moves them — so the merge after the await must
        // key off the offset this call actually fetched, never the shared one.
        const s = Math.max(0, start);
        const c = Math.max(0, count);
        lastStart = s;
        lastCount = c;
        const end = s + c;

        // Skip if every requested index is already cached at this revision.
        const current = get().rows;
        let hasGap = false;
        for (let i = s; i < end; i++) {
          if (!current.has(i)) {
            hasGap = true;
            break;
          }
        }
        if (!hasGap) return;

        const window = await model.getRows(s, c);
        if (gen !== myGen) return;
        // Drop a window whose revision no longer matches what we render. Within
        // a revision a row is immutable, so an out-of-order same-revision window
        // is safe to merge at its own offset below.
        // NOTE: this drops a window from a NEWER revision too. That's correct
        // for the current model (revision only advances via our own mutations,
        // which refetch). A future self-advancing source (streaming append)
        // would need to notify the store so it resyncs forward instead of
        // dropping — a seam concern, out of scope here.
        if (window.revision !== get().revision) return;

        // Merge only missing indices: preserving existing objects keeps scroll
        // re-fetches from re-rendering unchanged rows. Only allocate a new Map
        // if something was added.
        const existing = get().rows;
        let nextRows: Map<number, JsonRow> | null = null;
        window.rows.forEach((row, k) => {
          const index = s + k;
          if (!existing.has(index)) {
            if (!nextRows) nextRows = new Map(existing);
            nextRows.set(index, row);
          }
        });
        if (nextRows) set({ rows: nextRows });
      },

      toggle: (nodeId, currentlyExpanded) => {
        // Capture the generation NOW, at enqueue time — not inside the queued
        // callback. nodeIds restart per engine, so if the document is swapped
        // (init bumps gen, new model) while this mutation waits in the serialize
        // queue, applying the stale nodeId to the new model would toggle an
        // unrelated node. Abandon it instead.
        const callGen = gen;
        return serialize(async () => {
          if (!model || gen !== callGen) return;
          setPending(nodeId, true);
          const startedAt = performance.now();
          try {
            if (currentlyExpanded) {
              await model.collapse(nodeId);
            } else {
              await model.expand(nodeId);
            }
            if (gen !== callGen) return;
            await refreshAfterMutation();
            // Expand pays the byte engine's deferred per-container scan (a wide
            // container's O(N) cost lands here); measure it so the boundary can
            // flag slow expands. Collapse has no scan — don't bother.
            if (!currentlyExpanded) {
              emitMetric({ kind: "expand", ms: performance.now() - startedAt });
            }
          } catch (e) {
            // Deferred per-container scan threw on expand — don't let serialize's
            // rejection handler swallow it silently.
            if (gen === callGen) captureAndSetError(e);
          } finally {
            if (gen === callGen) setPending(nodeId, false);
          }
        });
      },

      loadMore: (loadMoreId) => {
        const callGen = gen;
        return serialize(async () => {
          if (!model || gen !== callGen) return;
          setPending(loadMoreId, true);
          try {
            await model.loadMore(loadMoreId);
            if (gen !== callGen) return;
            await refreshAfterMutation();
          } catch (e) {
            // Deferred scan of the next page threw — capture, don't swallow.
            if (gen === callGen) captureAndSetError(e);
          } finally {
            if (gen === callGen) setPending(loadMoreId, false);
          }
        });
      },

      materialize: async (nodeId, maxBytes) => {
        if (!model) return;
        const myGen = gen;
        try {
          const result = await model.getValue(nodeId, maxBytes);
          if (gen !== myGen) return;
          // getValue reports failures as data (ok:false). Surface a genuine
          // materialization failure to Sentry, but do NOT tear down the whole
          // viewer for one leaf — store the result and let the caller react.
          if (!result.ok) {
            reportError(new Error(result.error), { area: "json-viewer" });
          }
          const next = new Map(get().values);
          next.set(nodeId, result);
          set({ values: next });
        } catch (e) {
          // Defensive: the seam says getValue never throws, but a future source
          // might. Report without tearing the viewer down.
          if (gen === myGen) reportError(e, { area: "json-viewer" });
        }
      },

      dispose: () => {
        gen++;
        model = null;
      },
    };
  });
}
