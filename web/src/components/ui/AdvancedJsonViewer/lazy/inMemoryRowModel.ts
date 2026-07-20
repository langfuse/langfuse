/**
 * InMemoryRowModel — a `RowModel` over an already-parsed JS value (LFE-11080).
 *
 * Keeps cost proportional to what is expanded/visible, not to document size:
 * - children of a container are materialized only when it is expanded (via the
 *   `ChildProvider`), one bounded page at a time — a wide container reveals a
 *   first page plus a synthetic "load more" row;
 * - rows carry only a bounded preview, never the full value (a 20 MB string is
 *   previewed, not shipped); the full value is fetched on demand by `getValue`;
 * - the flattened visible list is rebuilt only on structural change
 *   (expand/collapse/load-more), never per scroll frame, with an iterative walk
 *   (safe on deeply nested trees).
 *
 * The method surface is async to match the future worker/byte-index model; here
 * everything resolves immediately.
 */

import type { JSONType } from "../types";
import { getJSONType, isExpandable, getChildCount } from "../utils/jsonTypes";
import {
  createInMemoryChildProvider,
  type ChildProvider,
} from "../utils/childProvider";
import type { JsonRow, MaterializedValue, RowModel } from "./rowModel";

/** Preview character budget per row — bounded regardless of value size. */
const PREVIEW_MAX = 200;

interface ModelNode {
  nodeId: number;
  keyOrIndex: string | number | null;
  value: unknown;
  type: JSONType;
  depth: number;
  expandable: boolean;
  childCount: number;
  expanded: boolean;
  /** Immediate children materialized so far (grows as pages load). */
  children: ModelNode[];
  /** How many immediate children have been materialized (pagination cursor). */
  loadedCount: number;
  /** Id of this container's synthetic "load more" row while more remain. */
  loadMoreId: number | null;
}

/** A flattened visible entry: a real node, or a container's load-more marker. */
type VisibleEntry =
  | { kind: "node"; node: ModelNode }
  | { kind: "loadMore"; owner: ModelNode; id: number };

function previewOf(node: ModelNode): { preview: string; truncated: boolean } {
  const { value, type } = node;
  if (type === "array") {
    return { preview: `Array(${node.childCount})`, truncated: false };
  }
  if (type === "object") {
    const c = node.childCount;
    return {
      preview: c === 0 ? "{}" : c === 1 ? "{1 key}" : `{${c} keys}`,
      truncated: false,
    };
  }
  if (type === "string") {
    const s = value as string;
    return s.length > PREVIEW_MAX
      ? { preview: s.slice(0, PREVIEW_MAX), truncated: true }
      : { preview: s, truncated: false };
  }
  return { preview: String(value), truncated: false };
}

export class InMemoryRowModel implements RowModel {
  private readonly provider: ChildProvider;
  private readonly nodes = new Map<number, ModelNode>();
  private readonly loadMoreOwners = new Map<number, ModelNode>();
  private readonly root: ModelNode;
  private nextId = 0;
  private visible: VisibleEntry[] = [];

  constructor(
    rootValue: unknown,
    provider: ChildProvider = createInMemoryChildProvider(),
  ) {
    this.provider = provider;
    const expandable = isExpandable(rootValue);
    this.root = {
      nodeId: this.nextId++,
      keyOrIndex: null,
      value: rootValue,
      type: getJSONType(rootValue),
      depth: 0,
      expandable,
      childCount: expandable ? getChildCount(rootValue) : 0,
      expanded: false,
      children: [],
      loadedCount: 0,
      loadMoreId: null,
    };
    this.nodes.set(this.root.nodeId, this.root);
    // Expand the root one level so the viewer isn't empty; deeper levels stay
    // collapsed (lazy) until the user opens them.
    if (expandable) {
      this.materializeNextPage(this.root);
      this.root.expanded = true;
    }
    this.rebuildVisible();
  }

  /** Materialize the next page of `node`'s immediate children. */
  private materializeNextPage(node: ModelNode): void {
    if (!node.expandable) return;
    const page = this.provider.getChildPage(node.value, node.loadedCount, 0);
    for (const d of page.children) {
      const child: ModelNode = {
        nodeId: this.nextId++,
        keyOrIndex: d.key,
        value: d.value,
        type: d.type,
        depth: node.depth + 1,
        expandable: d.isExpandable,
        childCount: d.childCount,
        expanded: false,
        children: [],
        loadedCount: 0,
        loadMoreId: null,
      };
      this.nodes.set(child.nodeId, child);
      node.children.push(child);
    }
    node.loadedCount = page.offset + page.children.length;
    if (node.loadedCount < page.total && node.loadMoreId === null) {
      node.loadMoreId = this.nextId++;
      this.loadMoreOwners.set(node.loadMoreId, node);
    } else if (node.loadedCount >= page.total && node.loadMoreId !== null) {
      this.loadMoreOwners.delete(node.loadMoreId);
      node.loadMoreId = null;
    }
  }

  /** Rebuild the flattened visible list — iterative pre-order (deep-tree safe). */
  private rebuildVisible(): void {
    const out: VisibleEntry[] = [];
    type Frame =
      | { kind: "node"; node: ModelNode }
      | { kind: "loadMore"; owner: ModelNode };
    const stack: Frame[] = [{ kind: "node", node: this.root }];
    while (stack.length > 0) {
      const frame = stack.pop()!;
      if (frame.kind === "loadMore") {
        out.push({
          kind: "loadMore",
          owner: frame.owner,
          id: frame.owner.loadMoreId!,
        });
        continue;
      }
      const node = frame.node;
      out.push({ kind: "node", node });
      if (node.expandable && node.expanded) {
        // Push in reverse so children pop in order, with the load-more marker
        // (pushed first → popped last) landing after all children.
        if (node.loadMoreId !== null)
          stack.push({ kind: "loadMore", owner: node });
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push({ kind: "node", node: node.children[i]! });
        }
      }
    }
    this.visible = out;
  }

  private toRow(entry: VisibleEntry): JsonRow {
    if (entry.kind === "loadMore") {
      const remaining = entry.owner.childCount - entry.owner.loadedCount;
      return {
        nodeId: entry.id,
        depth: entry.owner.depth + 1,
        keyOrIndex: null,
        type: "null",
        preview: `Show ${remaining} more…`,
        truncatedPreview: false,
        expandable: false,
        expanded: false,
        isLoadMore: true,
      };
    }
    const { node } = entry;
    const { preview, truncated } = previewOf(node);
    return {
      nodeId: node.nodeId,
      depth: node.depth,
      keyOrIndex: node.keyOrIndex,
      type: node.type,
      childCount: node.expandable ? node.childCount : undefined,
      preview,
      truncatedPreview: truncated,
      expandable: node.expandable,
      expanded: node.expanded,
    };
  }

  getTotalVisible(): number {
    return this.visible.length;
  }

  async getRows(start: number, count: number): Promise<JsonRow[]> {
    const s = Math.max(0, start);
    return this.visible
      .slice(s, s + Math.max(0, count))
      .map((e) => this.toRow(e));
  }

  async getRowAt(index: number): Promise<JsonRow | undefined> {
    const entry = this.visible[index];
    return entry ? this.toRow(entry) : undefined;
  }

  async expand(nodeId: number): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node || !node.expandable || node.expanded) return;
    if (node.children.length === 0) this.materializeNextPage(node);
    node.expanded = true;
    this.rebuildVisible();
  }

  async collapse(nodeId: number): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node || !node.expanded) return;
    node.expanded = false;
    this.rebuildVisible();
  }

  async loadMore(loadMoreOrNodeId: number): Promise<void> {
    // Accept either the load-more row id or the container node id.
    const owner =
      this.loadMoreOwners.get(loadMoreOrNodeId) ??
      this.nodes.get(loadMoreOrNodeId);
    if (!owner || !owner.expandable || owner.loadedCount >= owner.childCount) {
      return;
    }
    this.materializeNextPage(owner);
    this.rebuildVisible();
  }

  async getValue(nodeId: number): Promise<MaterializedValue> {
    const node = this.nodes.get(nodeId);
    if (!node) return { value: undefined };
    // In-memory: precision was already preserved upstream (parsePreservingPrecision
    // keeps unsafe numbers as source strings), so just return the value.
    return { value: node.value };
  }
}
