/**
 * TreeRowModel — the ONE flatten/expand/paginate implementation (LFE-11080).
 *
 * Source-agnostic: it drives any `AsyncJsonSource` (the byte engine on the main
 * thread today, a Worker tomorrow), so the virtualized renderer is built exactly
 * once against this. Cost stays proportional to what is expanded/visible:
 * - a container's children are fetched (paged) only when it is expanded;
 * - a wide container reveals a first page plus a synthetic "load more" row;
 * - the flattened visible list is rebuilt iteratively (deep-tree safe) only on
 *   structural change, and every change bumps `revision` so a renderer can drop
 *   a row window that resolved against a stale model.
 */

import type { NodeDescriptor } from "./byteJsonIndex";
import type { AsyncJsonSource } from "./asyncJsonSource";
import type { JsonRow, RowModel, RowWindow, ValueResult } from "./rowModel";

/** Children fetched per expand / load-more. */
export const PAGE_SIZE = 100;

interface NodeState {
  descriptor: NodeDescriptor;
  depth: number;
  keyOrIndex: string | number | null;
  expandable: boolean;
  expanded: boolean;
  /**
   * True once this container has been scanned at least once (its first page
   * fetched). Distinguishes "never scanned" from "scanned and empty" — an empty
   * `{}`/`[]` never pushes into `childIds`, so `childIds.length` cannot tell
   * them apart, which would re-scan an empty container on every re-expand.
   */
  scanned: boolean;
  /** Materialized child nodeIds, in order (grows as pages load). */
  childIds: number[];
  loadedCount: number;
  total: number;
  hasMore: boolean;
  /** Synthetic negative id of this container's load-more row, when more remain. */
  loadMoreId: number | null;
}

type VisibleEntry =
  | { kind: "node"; nodeId: number }
  | { kind: "loadMore"; ownerId: number; id: number };

function keyOrIndexOf(d: NodeDescriptor): string | number | null {
  if (d.key !== undefined) return d.key;
  if (d.index !== undefined) return d.index;
  return null;
}

export class TreeRowModel implements RowModel {
  private readonly source: AsyncJsonSource;
  private readonly states = new Map<number, NodeState>();
  private readonly loadMoreOwner = new Map<number, number>();
  private readonly rootId: number;
  private revision = 0;
  private nextLoadMoreId = -1; // synthetic load-more rows use negative ids
  private visible: VisibleEntry[] = [];

  private constructor(source: AsyncJsonSource) {
    this.source = source;
    const root = source.root;
    this.rootId = root.nodeId;
    this.states.set(root.nodeId, this.newState(root, 0, keyOrIndexOf(root)));
    this.rebuildVisible();
  }

  /** Construct and expand the root one level (so the viewer isn't empty). */
  static async create(source: AsyncJsonSource): Promise<TreeRowModel> {
    const model = new TreeRowModel(source);
    if (model.states.get(model.rootId)!.expandable) {
      await model.expand(model.rootId);
    }
    return model;
  }

  private newState(
    descriptor: NodeDescriptor,
    depth: number,
    keyOrIndex: string | number | null,
  ): NodeState {
    return {
      descriptor,
      depth,
      keyOrIndex,
      expandable: descriptor.expandable,
      expanded: false,
      scanned: false,
      childIds: [],
      loadedCount: 0,
      total: descriptor.childCount ?? 0,
      hasMore: false,
      loadMoreId: null,
    };
  }

  /** Fetch and register the next page of `state`'s children. */
  private async loadPage(state: NodeState): Promise<void> {
    const page = await this.source.childrenPage(
      state.descriptor.nodeId,
      state.loadedCount,
      PAGE_SIZE,
    );
    for (const childDesc of page.children) {
      if (!this.states.has(childDesc.nodeId)) {
        this.states.set(
          childDesc.nodeId,
          this.newState(childDesc, state.depth + 1, keyOrIndexOf(childDesc)),
        );
      }
      state.childIds.push(childDesc.nodeId);
    }
    state.loadedCount += page.children.length;
    state.total = page.total;
    state.hasMore = page.hasMore;
    state.scanned = true;
    // The container has now been scanned (childrenPage built its child table),
    // so re-describe it. The descriptor captured pre-scan (from the parent's
    // page) carries the raw-JSON preview and an unknown childCount; the
    // refreshed one carries the Object(N)/Array(N) summary and the exact count
    // (including 0 for an empty container) — so the row's preview isn't a stale
    // duplicate of its own children, and the count badge survives a collapse.
    state.descriptor = this.source.describe(state.descriptor.nodeId);
    if (state.hasMore && state.loadMoreId === null) {
      state.loadMoreId = this.nextLoadMoreId--;
      this.loadMoreOwner.set(state.loadMoreId, state.descriptor.nodeId);
    } else if (!state.hasMore && state.loadMoreId !== null) {
      this.loadMoreOwner.delete(state.loadMoreId);
      state.loadMoreId = null;
    }
  }

  /** Rebuild the flattened visible list — iterative pre-order (deep-tree safe). */
  private rebuildVisible(): void {
    const out: VisibleEntry[] = [];
    type Frame =
      | { kind: "node"; nodeId: number }
      | { kind: "loadMore"; ownerId: number };
    const stack: Frame[] = [{ kind: "node", nodeId: this.rootId }];
    while (stack.length > 0) {
      const frame = stack.pop()!;
      if (frame.kind === "loadMore") {
        const owner = this.states.get(frame.ownerId)!;
        out.push({
          kind: "loadMore",
          ownerId: frame.ownerId,
          id: owner.loadMoreId!,
        });
        continue;
      }
      const state = this.states.get(frame.nodeId);
      if (!state) continue;
      out.push({ kind: "node", nodeId: frame.nodeId });
      if (state.expandable && state.expanded) {
        // Push in reverse so children pop in order, with the load-more marker
        // (pushed first → popped last) landing after all children.
        if (state.loadMoreId !== null) {
          stack.push({ kind: "loadMore", ownerId: frame.nodeId });
        }
        for (let i = state.childIds.length - 1; i >= 0; i--) {
          stack.push({ kind: "node", nodeId: state.childIds[i]! });
        }
      }
    }
    this.visible = out;
  }

  private toRow(entry: VisibleEntry): JsonRow {
    if (entry.kind === "loadMore") {
      const owner = this.states.get(entry.ownerId)!;
      const remaining = Math.max(0, owner.total - owner.loadedCount);
      return {
        nodeId: entry.id,
        depth: owner.depth + 1,
        keyOrIndex: null,
        type: "null",
        preview: `Show ${remaining} more…`,
        truncatedPreview: false,
        expandable: false,
        expanded: false,
        isLoadMore: true,
      };
    }
    const state = this.states.get(entry.nodeId)!;
    const d = state.descriptor;
    return {
      nodeId: entry.nodeId,
      depth: state.depth,
      keyOrIndex: state.keyOrIndex,
      type: d.type,
      // `d` is refreshed post-scan (see loadPage), so `d.childCount` is the
      // exact count after a container has been expanded — including 0 for an
      // empty one — and the badge survives a collapse. Before any scan it's the
      // parent-provided count (or undefined).
      childCount: state.expandable
        ? state.expanded
          ? state.total
          : d.childCount
        : undefined,
      preview: d.preview,
      truncatedPreview: d.truncatedPreview,
      expandable: state.expandable,
      expanded: state.expanded,
    };
  }

  getRevision(): number {
    return this.revision;
  }

  getTotalVisible(): number {
    return this.visible.length;
  }

  async getRows(start: number, count: number): Promise<RowWindow> {
    const s = Math.max(0, start);
    const rows = this.visible
      .slice(s, s + Math.max(0, count))
      .map((e) => this.toRow(e));
    return { revision: this.revision, rows };
  }

  async expand(nodeId: number): Promise<void> {
    const state = this.states.get(nodeId);
    if (!state || !state.expandable || state.expanded) return;
    if (!state.scanned) await this.loadPage(state);
    state.expanded = true;
    this.revision++;
    this.rebuildVisible();
  }

  async collapse(nodeId: number): Promise<void> {
    const state = this.states.get(nodeId);
    if (!state || !state.expanded) return;
    // Keep childIds/loadedCount so re-expand restores sub-expansion + progress.
    state.expanded = false;
    this.revision++;
    this.rebuildVisible();
  }

  async loadMore(loadMoreOrNodeId: number): Promise<void> {
    const ownerId =
      this.loadMoreOwner.get(loadMoreOrNodeId) ?? loadMoreOrNodeId;
    const state = this.states.get(ownerId);
    if (!state || !state.expandable || !state.hasMore) return;
    await this.loadPage(state);
    this.revision++;
    this.rebuildVisible();
  }

  async getValue(nodeId: number, maxBytes?: number): Promise<ValueResult> {
    if (nodeId < 0) {
      return { ok: false, error: "load-more row has no value" };
    }
    try {
      const value = await this.source.getValue(nodeId, maxBytes);
      return { ok: true, value };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
