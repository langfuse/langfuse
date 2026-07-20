/**
 * RowModel — the renderer-facing seam for the lazy JSON viewer (LFE-11080).
 *
 * The virtualized viewer talks to a JSON document ONLY through this async
 * contract: "how many visible rows are there, give me the window [start,count),
 * expand/collapse this node, materialize this node's full value." It never sees
 * the underlying tree, parsed object, or bytes — so the SAME renderer runs over:
 *
 *   - `InMemoryRowModel` (this increment) — a model over an already-parsed JS
 *     value; resolves effectively synchronously. Ships the freeze fix for
 *     payloads that still parse, with no backend dependency.
 *   - a worker/byte-index RowModel (LFE-11081/82) — the worker owns the bytes +
 *     a cached offset index and answers these same messages, so the document is
 *     never fully parsed or held on the main thread → the path to ~1 GB.
 *
 * The contract is async because the worker impl must be; the in-memory impl just
 * resolves immediately. The renderer requests the visible window and paints
 * skeletons for rows not yet delivered — uniform across both sources.
 *
 * Nodes are addressed by a stable, model-assigned numeric `nodeId` (not a path):
 * path re-derivation is O(depth) scans, and the worker impl needs a cheap handle.
 */

import type { JSONType } from "../types";

/**
 * One visible line. Carries only a BOUNDED preview of its value — never the
 * full value (a 20 MB string must not ride along in a row). The full value is
 * fetched on demand via `getValue`.
 */
export interface JsonRow {
  nodeId: number;
  /** Nesting depth (root = 0). */
  depth: number;
  /** Key in the parent: object property, array index, or null for the root. */
  keyOrIndex: string | number | null;
  type: JSONType;
  /** Immediate child count for containers (undefined for primitives). */
  childCount?: number;
  /** Bounded, display-ready preview of the value (truncated). */
  preview: string;
  /** Whether the preview was truncated (value longer than the preview budget). */
  truncatedPreview: boolean;
  expandable: boolean;
  expanded: boolean;
  /** Synthetic "load more" row for a paginated wide container (not a real
   *  JSON node — activating it reveals the next page via `loadMore`). */
  isLoadMore?: boolean;
}

/** A node's full value, materialized on demand. */
export interface MaterializedValue {
  value: unknown;
  /** Present when the value is a number that cannot round-trip through a JS
   *  double; carries the exact source text so precision isn't silently lost. */
  lossyNumber?: string;
}

/**
 * Async, source-agnostic model of the currently-visible rows of a JSON document.
 * Implementations must keep cost proportional to what is expanded/visible, never
 * to the total document size.
 */
export interface RowModel {
  /** Number of currently-visible rows (the virtualizer's row count). Cheap. */
  getTotalVisible(): number;

  /** The visible rows in `[start, start+count)`. */
  getRows(start: number, count: number): Promise<JsonRow[]>;

  /** Convenience: the single row at a visible index (`getRows(i, 1)[0]`). */
  getRowAt(index: number): Promise<JsonRow | undefined>;

  /** Expand a container node (materializes only its first page of children). */
  expand(nodeId: number): Promise<void>;

  /** Collapse a container node (drops its visible descendants). */
  collapse(nodeId: number): Promise<void>;

  /** Reveal the next page of a paginated wide container (or its load-more row). */
  loadMore(nodeId: number): Promise<void>;

  /** Materialize a single node's full value on demand. */
  getValue(nodeId: number): Promise<MaterializedValue>;
}
