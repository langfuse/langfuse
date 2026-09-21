import type { TopicDefinition } from "@langfuse/shared/topics";
import { normalizeVector } from "./classifier";

type Membership = {
  traceId: string;
  inputHash: string;
  topicVersionId: string | null;
};

const evidenceKey = (row: Pick<Membership, "traceId" | "inputHash">) =>
  JSON.stringify([row.traceId, row.inputHash]);

function uniqueEvidence<T extends Pick<Membership, "traceId" | "inputHash">>(
  rows: readonly T[],
): Map<string, T> {
  const traces = new Map<string, string>();
  const result = new Map<string, T>();
  for (const row of rows) {
    const previous = traces.get(row.traceId);
    if (previous !== undefined && previous !== row.inputHash)
      throw new Error("Topic cohort contains conflicting inputs for a trace");
    traces.set(row.traceId, row.inputHash);
    result.set(evidenceKey(row), row);
  }
  return result;
}

function membershipIndex(
  rows: readonly Membership[],
  topics: readonly TopicDefinition[],
) {
  const ids = new Set(topics.map((topic) => topic.topicVersionId));
  const result = uniqueEvidence(rows);
  for (const row of rows) {
    if (row.topicVersionId !== null && !ids.has(row.topicVersionId))
      throw new Error("Topic membership references an unknown version");
    if (result.get(evidenceKey(row))!.topicVersionId !== row.topicVersionId)
      throw new Error("Topic cohort contains conflicting memberships");
  }
  return result;
}

function cosineDistance(left: number[], right: number[]) {
  if (left.length !== right.length)
    throw new Error("Topic embedding dimensions differ");
  const a = normalizeVector(left);
  const b = normalizeVector(right);
  return Math.max(
    0,
    Math.min(2, 1 - a.reduce((sum, x, i) => sum + x * b[i], 0)),
  );
}

/**
 * Matches final serving memberships, independently of cluster labels and names.
 * These conservative PoC thresholds are provisional: at least 80% of both common
 * populations must agree, with 10 anchors (3 exploratory) and half of the old
 * population still represented. Material branches need 5 anchors (3 exploratory)
 * and 20% of either common population; all split/merge children start new IDs.
 */
export function matchTopicContinuity(input: {
  previousTopics: readonly TopicDefinition[];
  candidateTopics: readonly TopicDefinition[];
  previousMemberships: readonly Membership[];
  candidateMemberships: readonly Membership[];
  exploratory: boolean;
  compatibleEmbeddingSpace: boolean;
}): TopicDefinition[] {
  const previous = membershipIndex(
    input.previousMemberships,
    input.previousTopics,
  );
  const candidate = membershipIndex(
    input.candidateMemberships,
    input.candidateTopics,
  );
  const oldTotal = new Map<string, number>();
  const oldCommon = new Map<string, number>();
  const newCommon = new Map<string, number>();
  const overlaps = new Map<string, Map<string, number>>();
  const increment = (counts: Map<string, number>, id: string | null) => {
    if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  for (const [key, row] of previous) {
    increment(oldTotal, row.topicVersionId);
    const current = candidate.get(key);
    if (!current) continue;
    increment(oldCommon, row.topicVersionId);
    increment(newCommon, current.topicVersionId);
    if (row.topicVersionId === null || current.topicVersionId === null)
      continue;
    const counts =
      overlaps.get(current.topicVersionId) ?? new Map<string, number>();
    increment(counts, row.topicVersionId);
    overlaps.set(current.topicVersionId, counts);
  }
  const minimumShared = input.exploratory ? 3 : 10;
  const minimumBranch = input.exploratory ? 3 : 5;
  const pairs = input.candidateTopics.flatMap((current) =>
    input.previousTopics.flatMap((old) => {
      const sharedCount =
        overlaps.get(current.topicVersionId)?.get(old.topicVersionId) ?? 0;
      if (!sharedCount) return [];
      const previousCoverage = sharedCount / oldCommon.get(old.topicVersionId)!;
      const candidateCoverage =
        sharedCount / newCommon.get(current.topicVersionId)!;
      return [
        {
          previousTopic: old,
          candidateId: current.topicVersionId,
          sharedCount,
          previousCoverage,
          candidateCoverage,
          commonAnchorCoverage:
            oldCommon.get(old.topicVersionId)! /
            oldTotal.get(old.topicVersionId)!,
          centroidDistance: input.compatibleEmbeddingSpace
            ? cosineDistance(old.centroid, current.centroid)
            : null,
          material:
            sharedCount >= minimumBranch &&
            (previousCoverage >= 0.2 || candidateCoverage >= 0.2),
        },
      ];
    }),
  );
  const materialSuccessors = new Map<string, number>();
  for (const pair of pairs)
    if (pair.material)
      increment(materialSuccessors, pair.previousTopic.topicVersionId);

  return input.candidateTopics.map((current) => {
    const candidates = pairs
      .filter((pair) => pair.candidateId === current.topicVersionId)
      .sort(
        (a, b) =>
          b.sharedCount - a.sharedCount ||
          a.previousTopic.topicVersionId.localeCompare(
            b.previousTopic.topicVersionId,
          ),
      );
    const predecessors = candidates.filter((pair) => pair.material);
    const merged = predecessors.length > 1;
    const split = predecessors.some(
      (pair) =>
        (materialSuccessors.get(pair.previousTopic.topicVersionId) ?? 0) > 1,
    );
    const best = candidates[0];
    // Reciprocal 80% support implies a unique best match in both directions.
    const continued =
      !merged &&
      !split &&
      best &&
      best.sharedCount >= minimumShared &&
      best.previousCoverage >= 0.8 &&
      best.candidateCoverage >= 0.8 &&
      best.commonAnchorCoverage >= 0.5 &&
      (best.centroidDistance === null || best.centroidDistance <= 0.15);
    let status = "new";
    if (continued) status = "continued";
    else if (merged && split) status = "ambiguous";
    else if (merged) status = "merge";
    else if (split) status = "split";
    return {
      ...current,
      topicId: continued ? best.previousTopic.topicId : current.topicId,
      metadata: {
        ...current.metadata,
        predecessorTopicIds: predecessors
          .map((pair) => pair.previousTopic.topicId)
          .sort(),
        continuity: {
          version: 1,
          status,
          sharedCount: best?.sharedCount ?? 0,
          previousCoverage: best?.previousCoverage ?? 0,
          candidateCoverage: best?.candidateCoverage ?? 0,
          commonAnchorCoverage: best?.commonAnchorCoverage ?? 0,
          centroidDistance: best?.centroidDistance ?? null,
          predecessorTopicVersionIds: predecessors
            .map((pair) => pair.previousTopic.topicVersionId)
            .sort(),
        },
      },
    };
  });
}
