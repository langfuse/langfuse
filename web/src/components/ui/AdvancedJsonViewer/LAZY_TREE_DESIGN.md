# Lazy JSON tree — design (LFE-11080, part of the LFE-10847/LFE-10152 large-trace work)

## Problem

The JSON Beta viewer virtualizes the DOM (only visible rows paint) but builds the
**entire** node tree up front: one `TreeNode` per element **plus** a flat `allNodes`
array (~2n objects), synchronously on the main thread, before any paint. A ~20 MB
structured payload is ~1M nodes → the build freezes the tab. "JIT O(log n)" here is
lazy _navigation_ over an already-complete tree, not lazy _building_.

Interim stopgap: a node-count gate (LFE-10847, PR #15230) refuses to build above 50k
nodes and shows a download fallback. This is the real fix: **never build more of the
tree than what is expanded/visible.**

## The seam: `ChildProvider`

`utils/childProvider.ts` defines the one abstraction that decouples the tree from its
data source. A provider returns a container's **immediate** children, one bounded
**page** at a time, on demand — never up front, never recursing.

```
getChildPage(parentValue, offset, limit) -> { children, offset, total, hasMore }
```

Two implementations satisfy the same contract, so the tree/nav/search UI is
source-agnostic:

- **`createInMemoryChildProvider()`** (this increment) — children from an
  already-parsed JS value. Ships the freeze fix for payloads that still parse.
- **byte-index provider** (LFE-11081/82, future) — a Worker returns children by
  scanning only that container's bytes in the source `ArrayBuffer`, so the full
  document is never parsed or held as a JS object → the path to ~1 GB.

Pagination is first-class (`CHILD_PAGE_SIZE = 100`) because one wide container
(millions of siblings) is itself an O(N) failure mode: reveal in pages, load more on
scroll.

## Plan (this increment → next)

1. **[done]** `ChildProvider` contract + in-memory provider + tests (this commit).
2. Rework tree building to materialize a node's `children` **on expand** via the
   provider instead of the eager `buildTreeStructureIterative` PASS 1. Reuse the
   existing offset/`getNodeByIndex` machinery (`treeNavigation.ts`,
   `treeExpansion.ts`) — it already treats a collapsed node as `visibleDescendantCount = 0`;
   the only change is that a not-yet-expanded node's `children` are unmaterialized
   until first expand, and offsets recompute on expand as they do today.
3. Drop the eager `allNodes` array. Search (LFE-11083) becomes an on-demand walk /
   Worker scan instead of iterating a prebuilt flat array.
4. Wide-container stubs in the tree (page nodes / "load more"), fed by provider pages.
5. Swap in the byte-index provider (LFE-11081/82) — no change to the tree/nav/search
   layer, only the provider.

## Contract the tree must keep (consumed by the virtualized viewer)

`rootNode.visibleDescendantCount` (virtualizer count), `getNodeByIndex(root, i)`,
`findNodeIndex/findSectionHeaderIndex`, expand/collapse + offset recompute, and
per-node fields (`id`, `depth`, `childOffsets`, `value`, `pathArray`, …). Making
children lazy must not change these signatures — only when `children` get populated.
