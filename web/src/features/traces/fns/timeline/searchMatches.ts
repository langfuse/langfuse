/**
 * Which timeline ROWS a search lights up.
 *
 * A match is an observation, but the timeline draws rows, and a collapsed row
 * hides its whole subtree. Dimming purely by matched-observation id therefore
 * fades a collapsed parent that is standing in for a hit — the count says
 * "3 matches" while the chart lights two and the reveal has nowhere to scroll,
 * because the third row does not exist.
 *
 * So a visible row is lit when it matched, or when it is COLLAPSED and
 * something it is hiding matched. That is the only reading a collapsed row can
 * honestly carry: it stands in for its subtree, so it stands in for the
 * subtree's hits. An expanded parent is not lit by a child's match — the child
 * has its own row and can say so itself.
 *
 * The count stays observation-level: the number of matching observations, the
 * same number the flat result list gives, not the number of lit rows. Those
 * are different facts, and collapsing a subtree should not change how many
 * things matched.
 */
import { type LayoutNode } from "./layout";

export function litRowIds({
  roots,
  collapsed,
  matchedIds,
}: {
  roots: LayoutNode[];
  /** Ids whose descendants are hidden — the same set the rows are built with. */
  collapsed?: ReadonlySet<string>;
  matchedIds: ReadonlySet<string>;
}): Set<string> {
  const lit = new Set<string>();
  if (matchedIds.size === 0) return lit;

  /**
   * Walks the full tree, not the rendered rows — which is the whole point: the
   * hits that need lifting are exactly the ones no row exists for. Returns
   * whether this node or anything below it matched, so the nearest VISIBLE
   * collapsed ancestor can claim it.
   */
  const visit = (node: LayoutNode, hidden: boolean): boolean => {
    const isCollapsed = collapsed?.has(node.id) ?? false;
    let descendantMatched = false;
    for (const child of node.children) {
      // Hidden propagates: below a collapsed row, everything is hidden.
      if (visit(child, hidden || isCollapsed)) descendantMatched = true;
    }
    const ownMatch = matchedIds.has(node.id);
    // A hidden row has nothing to light. Its match travels up the return value
    // and lands on the nearest visible collapsed ancestor instead.
    if (!hidden && (ownMatch || (isCollapsed && descendantMatched))) {
      lit.add(node.id);
    }
    return ownMatch || descendantMatched;
  };

  for (const root of roots) visit(root, false);
  return lit;
}
