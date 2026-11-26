import type { TopicDefinition } from "@langfuse/shared/topics";
import { normalizeVector } from "./classifier";

type Membership = {
  traceId: string;
  topicVersionId: string | null;
};

function membershipIndex(
  rows: readonly Membership[],
  topics: readonly Pick<TopicDefinition, "topicVersionId">[],
) {
  const ids = new Set(topics.map((topic) => topic.topicVersionId));
  const result = new Map<string, Membership>();
  for (const row of rows) {
    if (row.topicVersionId !== null && !ids.has(row.topicVersionId))
      throw new Error("Topic membership references an unknown version");
    const previous = result.get(row.traceId);
    if (previous && previous.topicVersionId !== row.topicVersionId)
      throw new Error("Topic cohort contains conflicting memberships");
    result.set(row.traceId, row);
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
 * and 20% of either common population. After a split or merge, only the dominant
 * successor keeps the old identity (inheritDominantSuccessors); other children start new IDs.
 */
export function matchTopicContinuity<
  T extends Pick<
    TopicDefinition,
    "topicVersionId" | "topicId" | "centroid" | "metadata"
  >,
>(input: {
  previousTopics: readonly TopicDefinition[];
  candidateTopics: readonly T[];
  previousMemberships: readonly Membership[];
  candidateMemberships: readonly Membership[];
  exploratory: boolean;
  compatibleEmbeddingSpace: boolean;
}): T[] {
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

  const matched = input.candidateTopics.map((current) => {
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
          version: 2,
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
  return inheritDominantSuccessors(matched, pairs, minimumShared);
}

type ContinuityPair = {
  previousTopic: Pick<TopicDefinition, "topicVersionId" | "topicId">;
  candidateId: string;
  sharedCount: number;
  previousCoverage: number;
  candidateCoverage: number;
  commonAnchorCoverage: number;
  centroidDistance: number | null;
};

/**
 * A split or merge child keeps an old topic's identity when the pair holds a majority both ways (of the old
 * topic's common members and of the child's), each is the other's largest match, no other child already
 * continues it, and the anchor and centroid checks of a plain continuation hold. Refits re-cut boundaries;
 * without this, a topic that shed a small branch loses its ID and name.
 */
function inheritDominantSuccessors<
  T extends Pick<TopicDefinition, "topicVersionId" | "topicId" | "metadata">,
>(matched: T[], pairs: ContinuityPair[], minimumShared: number): T[] {
  const status = (topic: T) =>
    (topic.metadata.continuity as { status: string }).status;
  const taken = new Set(
    matched
      .filter((topic) => status(topic) === "continued")
      .map((topic) => topic.topicId),
  );
  const largest = (key: (pair: ContinuityPair) => string) => {
    const best = new Map<string, ContinuityPair[]>();
    for (const pair of pairs) {
      const ranked = [...(best.get(key(pair)) ?? []), pair].sort(
        (a, b) => b.sharedCount - a.sharedCount,
      );
      best.set(key(pair), ranked.slice(0, 2));
    }
    return best;
  };
  const bySuccessor = largest((pair) => pair.candidateId);
  const byPredecessor = largest((pair) => pair.previousTopic.topicVersionId);
  const inherited = new Map<string, ContinuityPair>();
  for (const [, [pair, runnerUp]] of byPredecessor) {
    const [source, secondSource] = bySuccessor.get(pair.candidateId)!;
    const child = matched.find(
      (topic) => topic.topicVersionId === pair.candidateId,
    );
    if (
      child &&
      ["split", "merge"].includes(status(child)) &&
      isDominantSuccessor(
        pair,
        runnerUp,
        source,
        secondSource,
        minimumShared,
      ) &&
      !taken.has(pair.previousTopic.topicId) &&
      !inherited.has(pair.candidateId)
    ) {
      inherited.set(pair.candidateId, pair);
      taken.add(pair.previousTopic.topicId);
    }
  }
  return matched.map((topic) => {
    const pair = inherited.get(topic.topicVersionId);
    if (!pair) return topic;
    const continuity = topic.metadata.continuity as Record<string, unknown>;
    return {
      ...topic,
      topicId: pair.previousTopic.topicId,
      metadata: {
        ...topic.metadata,
        continuity: {
          ...continuity,
          status: "continued",
          inheritedFrom: continuity.status,
        },
      },
    };
  });
}

/** The pair is each side's strict largest match, holds a majority both ways, and passes the continuation checks. */
function isDominantSuccessor(
  pair: ContinuityPair,
  runnerUp: ContinuityPair | undefined,
  source: ContinuityPair,
  secondSource: ContinuityPair | undefined,
  minimumShared: number,
) {
  return (
    source === pair &&
    (!runnerUp || pair.sharedCount > runnerUp.sharedCount) &&
    (!secondSource || pair.sharedCount > secondSource.sharedCount) &&
    pair.previousCoverage > 0.5 &&
    pair.candidateCoverage > 0.5 &&
    pair.sharedCount >= minimumShared &&
    pair.commonAnchorCoverage >= 0.5 &&
    (pair.centroidDistance === null || pair.centroidDistance <= 0.15)
  );
}
