/**
 * What a live search does to the timeline's collapse state.
 *
 * A match is an observation, but the timeline draws rows, and a collapsed row
 * hides its whole subtree. A hit inside one therefore has no bar to light: the
 * toolbar says "3 matches" while a single stand-in parent is lit, and the
 * reveal-first-hit pan has nowhere to scroll.
 *
 * So the timeline draws those rows. While a query is live the collapsed rows
 * between a hit and the surface are treated as OPEN, which makes the count and
 * the lit bars the same fact: every match has a bar of its own. Only the
 * ANCESTORS open — a matched row that is itself collapsed already has a bar, and
 * the query said nothing about its children.
 *
 * Derived per render rather than written back to the shared collapse state:
 * clearing the search box restores exactly the shape the user had, and the tree
 * beside it does not reshuffle under a keystroke. The trade is that a live query
 * PINS the paths to its hits open — re-collapsing one while still searching does
 * not hold.
 */
import { type LayoutNode } from "./layout";

export function collapsedForSearch({
  roots,
  collapsed,
  matchedIds,
}: {
  roots: readonly LayoutNode[];
  /** The user's own collapse state — what the rows would be built with. */
  collapsed: ReadonlySet<string>;
  matchedIds: ReadonlySet<string>;
}): ReadonlySet<string> {
  // Same reference when nothing has to open, so the row layout downstream keeps
  // its memo instead of rebuilding on every keystroke.
  if (collapsed.size === 0 || matchedIds.size === 0) return collapsed;

  // Collapsed rows standing between a hit and a row of its own. Walks the full
  // tree, not the rendered rows — the hits that need a row are exactly the ones
  // no row exists for.
  const hiding = new Set<string>();
  // Explicit stack, not recursion: traces can nest thousands of levels deep
  // and the timeline must not blow the call stack on a keystroke.
  const stack: Array<{
    node: LayoutNode;
    collapsedAncestors: readonly string[];
  }> = roots.map((node) => ({ node, collapsedAncestors: [] }));
  while (stack.length > 0) {
    const { node, collapsedAncestors } = stack.pop()!;
    // The whole chain opens: an inner collapsed row is no use while an outer one
    // still hides it.
    if (collapsedAncestors.length > 0 && matchedIds.has(node.id)) {
      for (const id of collapsedAncestors) hiding.add(id);
    }
    if (node.children.length === 0) continue;
    const below = collapsed.has(node.id)
      ? [...collapsedAncestors, node.id]
      : collapsedAncestors;
    for (const child of node.children) {
      stack.push({ node: child, collapsedAncestors: below });
    }
  }

  if (hiding.size === 0) return collapsed;
  return new Set([...collapsed].filter((id) => !hiding.has(id)));
}
