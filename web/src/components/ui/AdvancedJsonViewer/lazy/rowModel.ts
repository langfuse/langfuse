/**
 * RowModel — the renderer-facing seam for the lazy JSON viewer (LFE-11080).
 *
 * The virtualized viewer talks to a JSON document ONLY through this async
 * contract: revision, total-visible count, a window of rows, expand/collapse,
 * page-in a wide container, and materialize one value. It never sees the
 * underlying bytes/tree — so the SAME renderer runs over the byte-indexer whether
 * that engine lives on the main thread (in-memory payloads, fed as bytes) or in
 * a Worker (the ~1 GB path). There is ONE tree/flatten implementation
 * (`TreeRowModel`) over one child source (`AsyncJsonSource`).
 *
 * Hardening the review (LFE-11079 Fable pass) demanded before a renderer is
 * built against this seam:
 * - **revision**: every structural mutation bumps a counter, and `getRows`
 *   stamps its result, so a renderer can discard a row window that resolved
 *   against a since-mutated model (worker responses race expand/collapse).
 * - **error envelope**: `getValue` returns a Result, never throws (malformed
 *   slices / unknown ids must not crash the UI).
 * - **truncation passthrough**: a value capped by the engine's byte budget is
 *   reported as such, so the UI can offer "download full" instead of lying.
 */

import type { JsonNodeType, GetValueResult } from "./byteJsonIndex";

export type { JsonNodeType };

/**
 * One visible line. Carries only a BOUNDED preview of its value — never the
 * full value. The full value is fetched on demand via `getValue`.
 */
export interface JsonRow {
  /** Stable id (engine nodeId ≥ 0; synthetic load-more rows use negative ids). */
  nodeId: number;
  depth: number;
  /** Key in the parent: object property, array index, or null for the root. */
  keyOrIndex: string | number | null;
  type: JsonNodeType;
  /** Immediate child count for containers (undefined for primitives/unknown). */
  childCount?: number;
  /** Bounded, display-ready preview of the value (from the engine). */
  preview: string;
  /** Whether the preview was cut short of the full value. */
  truncatedPreview: boolean;
  expandable: boolean;
  expanded: boolean;
  /** Synthetic "reveal next page" row for a paginated wide container. */
  isLoadMore?: boolean;
}

/** A window of visible rows, stamped with the revision it was computed at. */
export interface RowWindow {
  revision: number;
  rows: JsonRow[];
}

/** Result of materializing a value: never throws — errors are data. */
export type ValueResult =
  | { ok: true; value: GetValueResult }
  | { ok: false; error: string };

/**
 * Async, source-agnostic model of the currently-visible rows of a JSON document.
 * Cost stays proportional to what is expanded/visible, never to total size.
 */
export interface RowModel {
  /** Monotonic counter; bumped on every structural mutation (expand/collapse/
   *  load-more). Compare against `RowWindow.revision` to detect stale reads. */
  getRevision(): number;

  /** Number of currently-visible rows (the virtualizer's row count). Cheap. */
  getTotalVisible(): number;

  /** The visible rows in `[start, start+count)`, stamped with the revision. */
  getRows(start: number, count: number): Promise<RowWindow>;

  /** Expand a container (materializes only its first page of children). */
  expand(nodeId: number): Promise<void>;

  /** Collapse a container (drops its visible descendants). */
  collapse(nodeId: number): Promise<void>;

  /** Reveal the next page of a paginated wide container, given the container's
   *  nodeId or its load-more row id. */
  loadMore(nodeId: number): Promise<void>;

  /** Materialize a single node's full value on demand (never throws). */
  getValue(nodeId: number): Promise<ValueResult>;
}
