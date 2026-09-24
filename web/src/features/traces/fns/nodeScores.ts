/**
 * Which tree node owns a trace's trace-level scores (`observationId === null`).
 *
 * v3 traces render a TRACE wrapper row that owns them. v4 events-based traces
 * have no such row, so the top-level span(s) stand in for the trace.
 *
 * Ownership only widens a node's Scores tab to the trace-level rows. Badges
 * never mix levels: the trace header carries the trace-level chips, a tree row
 * carries only its own.
 */

import { type TreeNode } from "../types/treeNode";

type LeveledScore = { observationId: string | null };

/**
 * Pass the STRUCTURAL roots, never the level-filtered ones: hiding a root
 * promotes its children to the top of the rendered tree, and a promoted child is
 * not a stand-in for the trace. TraceDataContext owns the one call site.
 *
 * `excludeId` covers the same class of impostor from the other direction: an
 * observation merged in from outside the loaded list whose parent is also missing
 * lands among the roots because its parent reference could not be resolved, not
 * because it is top-level. Without excluding it, a v4 trace (no TRACE row) hands
 * it the trace's scores and its root-only chrome.
 */
export function traceLevelScoreOwnerIds(
  roots: Pick<TreeNode, "id" | "type">[],
  excludeId?: string | null,
): Set<string> {
  const structural = excludeId
    ? roots.filter((root) => root.id !== excludeId)
    : roots;
  const traceNodes = structural.filter((root) => root.type === "TRACE");
  const owners = traceNodes.length > 0 ? traceNodes : structural;
  return new Set(owners.map((owner) => owner.id));
}

/** Scores to show for one node, in the order they were given. */
export function selectNodeScores<T extends LeveledScore>(
  scores: T[],
  nodeId: string,
): T[] {
  return scores.filter((score) => score.observationId === nodeId);
}
