import type { TranscriptObservation } from "./types";

/**
 * Order observations the way the trace tree walks them: depth first, with
 * roots and siblings by start time. Mirrors the web tree builder's rules: one
 * row per id where the earliest start wins, and a row whose parent is not in
 * the list becomes a root. For a flat trace this is plain start-time order.
 */
export function orderObservations<T extends TranscriptObservation>(
  observations: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const observation of observations) {
    const existing = byId.get(observation.id);
    if (!existing || observation.startTime < existing.startTime) {
      byId.set(observation.id, observation);
    }
  }

  const children = new Map<string | null, T[]>();
  for (const observation of byId.values()) {
    const parentId =
      observation.parentObservationId !== null &&
      byId.has(observation.parentObservationId)
        ? observation.parentObservationId
        : null;
    children.set(parentId, [...(children.get(parentId) ?? []), observation]);
  }

  const byStartTime = (a: T, b: T) =>
    a.startTime.getTime() - b.startTime.getTime();
  const ordered: T[] = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null) => {
    for (const observation of (children.get(parentId) ?? []).sort(
      byStartTime,
    )) {
      if (visited.has(observation.id)) continue;
      visited.add(observation.id);
      ordered.push(observation);
      walk(observation.id);
    }
  };
  walk(null);
  // Rows inside a parent cycle are unreachable from any root; keep them.
  for (const observation of [...byId.values()].sort(byStartTime)) {
    if (!visited.has(observation.id)) ordered.push(observation);
  }
  return ordered;
}
