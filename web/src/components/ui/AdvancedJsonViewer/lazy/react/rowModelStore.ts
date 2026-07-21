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
 * Staleness is handled by the seam's revision stamp: a window that resolves
 * against a since-mutated model is dropped, and within one revision a visible
 * row is immutable, so scrolling re-fetches never churn stable row objects.
 */

import { createStore, type StoreApi } from "zustand/vanilla";
import { TreeRowModel } from "../treeRowModel";
import { sourceFromValue } from "../asyncJsonSource";
import type { JsonRow, RowModel, ValueResult } from "../rowModel";

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

  /** Build the model over an in-memory value and prefetch the first window. */
  init: (value: unknown) => Promise<void>;
  /** Ensure rows for `[start, start+count)` are cached (called on scroll). */
  ensureRange: (start: number, count: number) => Promise<void>;
  /** Expand or collapse a container, then refresh the visible window. */
  toggle: (nodeId: number, currentlyExpanded: boolean) => Promise<void>;
  /** Reveal the next page of a wide container (given its load-more row id). */
  loadMore: (loadMoreId: number) => Promise<void>;
  /** Materialize one node's full value on demand (result stored in `values`). */
  materialize: (nodeId: number) => Promise<void>;
  /** Mark the store torn down so in-flight async work no-ops on resolve. */
  dispose: () => void;
}

export type RowModelStore = StoreApi<RowModelState>;

export function createRowModelStore(): RowModelStore {
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

  return createStore<RowModelState>((set, get) => {
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

    return {
      status: "loading",
      error: null,
      revision: 0,
      totalVisible: 0,
      rows: new Map(),
      values: new Map(),

      init: async (value) => {
        const myGen = ++gen;
        model = null;
        set({ status: "loading", error: null });
        try {
          const built = await TreeRowModel.create(sourceFromValue(value));
          if (gen !== myGen) return;
          model = built;
          set({
            status: "ready",
            revision: built.getRevision(),
            totalVisible: built.getTotalVisible(),
            rows: new Map(),
            values: new Map(),
          });
          await get().ensureRange(0, INITIAL_ROW_COUNT);
        } catch (e) {
          if (gen !== myGen) return;
          set({
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      },

      ensureRange: async (start, count) => {
        if (!model) return;
        const myGen = gen;
        lastStart = Math.max(0, start);
        lastCount = Math.max(0, count);
        const end = lastStart + lastCount;

        // Skip if every requested index is already cached at this revision.
        const current = get().rows;
        let hasGap = false;
        for (let i = lastStart; i < end; i++) {
          if (!current.has(i)) {
            hasGap = true;
            break;
          }
        }
        if (!hasGap) return;

        const revBefore = get().revision;
        const window = await model.getRows(lastStart, lastCount);
        if (gen !== myGen) return;
        // Drop a window computed against a since-mutated model, and one whose
        // revision no longer matches what the store is rendering.
        if (
          window.revision !== get().revision ||
          revBefore !== get().revision
        ) {
          return;
        }

        // Merge only missing indices: within a revision a row is immutable, so
        // preserving existing objects keeps scroll re-fetches from re-rendering
        // unchanged rows. Only allocate a new Map if something was added.
        const existing = get().rows;
        let next: Map<number, JsonRow> | null = null;
        window.rows.forEach((row, k) => {
          const index = lastStart + k;
          if (!existing.has(index)) {
            if (!next) next = new Map(existing);
            next.set(index, row);
          }
        });
        if (next) set({ rows: next });
      },

      toggle: async (nodeId, currentlyExpanded) => {
        if (!model) return;
        const myGen = gen;
        if (currentlyExpanded) {
          await model.collapse(nodeId);
        } else {
          await model.expand(nodeId);
        }
        if (gen !== myGen) return;
        await refreshAfterMutation();
      },

      loadMore: async (loadMoreId) => {
        if (!model) return;
        const myGen = gen;
        await model.loadMore(loadMoreId);
        if (gen !== myGen) return;
        await refreshAfterMutation();
      },

      materialize: async (nodeId) => {
        if (!model) return;
        const myGen = gen;
        const result = await model.getValue(nodeId);
        if (gen !== myGen) return;
        const next = new Map(get().values);
        next.set(nodeId, result);
        set({ values: next });
      },

      dispose: () => {
        gen++;
        model = null;
      },
    };
  });
}
