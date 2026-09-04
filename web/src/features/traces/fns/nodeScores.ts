/**
 * Which tree node owns a trace's trace-level scores (`observationId === null`).
 *
 * v3 traces render a TRACE wrapper row that owns them. v4 events-based traces
 * have no such row, so the top-level span(s) stand in for the trace and own
 * them alongside their own observation-level scores.
 *
 * Single source of this rule: the tree badge, the timeline badge and the Scores
 * tab all derive from it, so a node's badge count and its Scores tab agree
 * (LFE-14405).
 */

import { type TreeNode } from "../types/treeNode";

type LeveledScore = {
  observationId: string | null;
  traceId?: string | null;
};

type ScoreOwnerNode = Pick<TreeNode, "id" | "type"> & {
  children?: ScoreOwnerNode[];
};

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
  roots: ScoreOwnerNode[],
  excludeId?: string | null,
): Set<string> {
  const structural = excludeId
    ? roots.filter((root) => root.id !== excludeId)
    : roots;
  const traceNodes = structural.flatMap((root) =>
    root.type === "SESSION"
      ? (root.children ?? []).filter((child) => child.type === "TRACE")
      : root.type === "TRACE"
        ? [root]
        : [],
  );
  const owners = traceNodes.length > 0 ? traceNodes : structural;
  return new Set(owners.map((owner) => owner.id));
}

/** Scores to show for one node, in the order they were given. */
export function selectNodeScores<T extends LeveledScore>(
  scores: T[],
  nodeId: string,
  traceLevelOwnerIds: Set<string>,
  traceId?: string,
): T[] {
  const traceScores = traceId
    ? scores.filter((score) => score.traceId === traceId)
    : scores;
  return traceLevelOwnerIds.has(nodeId)
    ? traceScores.filter(
        (score) =>
          score.observationId === nodeId || score.observationId === null,
      )
    : traceScores.filter((score) => score.observationId === nodeId);
}
