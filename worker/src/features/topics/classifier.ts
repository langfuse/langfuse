import { createHash } from "node:crypto";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import type { TopicSummary } from "@langfuse/shared/topics";

interface TopicPrototype {
  id: string;
  centroid: number[];
  radius: number;
}

export function topicHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function normalizeVector(vector: number[]): number[] {
  return normalizeInto(vector, []);
}

function normalizeInto(vector: number[], normalized: number[]): number[] {
  if (!vector.length || vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid topic embedding");
  }
  const norm = Math.hypot(...vector);
  if (norm < 1e-12) throw new Error("Topic embedding has zero norm");
  normalized.length = vector.length;
  for (let index = 0; index < vector.length; index++)
    normalized[index] = vector[index] / norm;
  return normalized;
}

/** Keep vector work in bounded batches so queue lock timers can run. */
function bulkCheckpoint() {
  let work = 0;
  return () => (++work % 128 === 0 ? yieldToEventLoop() : undefined);
}

function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length)
    throw new Error("Topic embedding dimensions differ");
  return Math.max(
    0,
    Math.min(2, 1 - a.reduce((sum, value, i) => sum + value * b[i], 0)),
  );
}

function quantile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return (
    sorted[lower] +
    (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower)
  );
}

/** Derives portable prototypes from density-clustering seeds in original space. */
export async function buildTopicPrototypes(
  summaries: Pick<TopicSummary, "embedding">[],
  labels: number[],
): Promise<TopicPrototype[]> {
  if (labels.length !== summaries.length)
    throw new Error("Clustering result length mismatch");
  const checkpoint = bulkCheckpoint();
  const vector: number[] = [];
  const otherVector: number[] = [];
  const populations = new Map<number, { indices: number[]; sum: number[] }>();
  for (let index = 0; index < summaries.length; index++) {
    normalizeInto(summaries[index].embedding, vector);
    const label = labels[index];
    if (label >= 0) {
      let population = populations.get(label);
      if (!population) {
        population = { indices: [], sum: vector.map(() => 0) };
        populations.set(label, population);
      }
      if (population.sum.length !== vector.length)
        throw new Error("Topic embedding dimensions differ");
      population.indices.push(index);
      for (let dimension = 0; dimension < vector.length; dimension++)
        population.sum[dimension] += vector[dimension];
    }
    const pause = checkpoint();
    if (pause) await pause;
  }
  const groups = [];
  for (const [label, { indices, sum }] of [...populations].sort(
    ([left], [right]) => left - right,
  )) {
    groups.push({
      label,
      indices,
      sum,
      centroid: normalizeVector(sum.map((value) => value / indices.length)),
    });
    const pause = checkpoint();
    if (pause) await pause;
  }
  const prototypes: TopicPrototype[] = [];
  for (const group of groups) {
    const positives: number[] = [];
    for (const index of group.indices) {
      const otherCount = group.indices.length - 1;
      if (!otherCount) {
        positives.push(0);
        continue;
      }
      normalizeInto(summaries[index].embedding, vector);
      let mean = group.sum.map(
        (value, dimension) => (value - vector[dimension]) / otherCount,
      );
      // Re-sum nearly cancelling vectors to avoid amplifying subtraction error.
      if (Math.hypot(...mean) < 1e-6) {
        mean = group.sum.map(() => 0);
        for (const other of group.indices) {
          if (other === index) continue;
          normalizeInto(summaries[other].embedding, otherVector);
          for (let dimension = 0; dimension < mean.length; dimension++)
            mean[dimension] += otherVector[dimension];
          const pause = checkpoint();
          if (pause) await pause;
        }
        mean = mean.map((value) => value / otherCount);
      }
      positives.push(cosineDistance(vector, normalizeVector(mean)));
      const pause = checkpoint();
      if (pause) await pause;
    }
    let rival: (typeof groups)[number] | undefined;
    let rivalDistance = Infinity;
    for (const candidate of groups) {
      if (candidate === group) continue;
      const distance = cosineDistance(group.centroid, candidate.centroid);
      if (distance < rivalDistance) {
        rival = candidate;
        rivalDistance = distance;
      }
      const pause = checkpoint();
      if (pause) await pause;
    }
    const rivalDistances: number[] = [];
    if (rival)
      for (const index of rival.indices) {
        normalizeInto(summaries[index].embedding, vector);
        rivalDistances.push(cosineDistance(vector, group.centroid));
        const pause = checkpoint();
        if (pause) await pause;
      }
    prototypes.push({
      id: `cluster_${group.label}`,
      centroid: group.centroid,
      radius: Math.min(
        quantile(positives, 0.95),
        rival ? quantile(rivalDistances, 0.05) : 2,
      ),
    });
  }
  return prototypes;
}

export function classifyTopic(
  embedding: number[],
  prototypes: TopicPrototype[],
) {
  const vector = normalizeVector(embedding);
  return nearestTopic(prototypes, (prototype) =>
    cosineDistance(vector, prototype.centroid),
  );
}

function nearestTopic(
  prototypes: TopicPrototype[],
  distanceAt: (prototype: TopicPrototype, index: number) => number,
) {
  let nearest: TopicPrototype | undefined;
  let nearestDistance = Infinity;
  let runnerUp: TopicPrototype | undefined;
  let runnerUpDistance = Infinity;
  for (let index = 0; index < prototypes.length; index++) {
    const prototype = prototypes[index];
    const distance = distanceAt(prototype, index);
    if (
      !nearest ||
      (distance - nearestDistance || prototype.id.localeCompare(nearest.id)) < 0
    ) {
      runnerUp = nearest;
      runnerUpDistance = nearestDistance;
      nearest = prototype;
      nearestDistance = distance;
    } else if (
      !runnerUp ||
      (distance - runnerUpDistance || prototype.id.localeCompare(runnerUp.id)) <
        0
    ) {
      runnerUp = prototype;
      runnerUpDistance = distance;
    }
  }
  // Normalization and centroid averaging can differ by floating-point roundoff.
  const accepted = nearest && nearestDistance <= nearest.radius + 1e-12;
  return {
    topicId: nearest && accepted ? nearest.id : null,
    distance: nearest ? nearestDistance : null,
    runnerUpDistance: runnerUp ? runnerUpDistance : null,
  };
}

async function classifyBulkRow(
  embedding: number[],
  prototypes: TopicPrototype[],
  vector: number[],
  distances: number[],
  checkpoint: ReturnType<typeof bulkCheckpoint>,
) {
  normalizeInto(embedding, vector);
  for (let index = 0; index < prototypes.length; index++) {
    distances[index] = cosineDistance(vector, prototypes[index].centroid);
    const pause = checkpoint();
    if (pause) await pause;
  }
  const pause = checkpoint();
  if (pause) await pause;
  return nearestTopic(prototypes, (_, index) => distances[index]);
}

/** Removing competitors cannot displace a retained prototype's accepted members. */
export async function retainPopulatedTopics<T extends TopicPrototype>(
  summaries: Pick<TopicSummary, "embedding">[],
  prototypes: T[],
): Promise<T[]> {
  const checkpoint = bulkCheckpoint();
  const vector: number[] = [];
  const distances: number[] = [];
  const active = new Set<string | null>();
  for (const summary of summaries)
    active.add(
      (
        await classifyBulkRow(
          summary.embedding,
          prototypes,
          vector,
          distances,
          checkpoint,
        )
      ).topicId,
    );
  return prototypes.filter((prototype) => active.has(prototype.id));
}

/** Names only populations produced by the same classifier used for new traces. */
export async function buildNamingEvidence(
  summaries: TopicSummary[],
  prototypes: TopicPrototype[],
) {
  const checkpoint = bulkCheckpoint();
  const vector: number[] = [];
  const distances: number[] = [];
  type Example = { summary: TopicSummary; distance: number };
  const populations = prototypes.map(({ id }) => ({
    id,
    members: [] as TopicSummary[],
    contrasts: [] as Example[],
  }));
  for (const summary of summaries) {
    const result = await classifyBulkRow(
      summary.embedding,
      prototypes,
      vector,
      distances,
      checkpoint,
    );
    for (let index = 0; index < populations.length; index++) {
      const population = populations[index];
      const distance = distances[index];
      if (population.id === result.topicId) population.members.push(summary);
      else {
        const contrasts = population.contrasts;
        const before = contrasts.findIndex((item) => distance < item.distance);
        const position = before === -1 ? contrasts.length : before;
        if (position < 3) {
          contrasts.splice(position, 0, { summary, distance });
          if (contrasts.length > 3) contrasts.pop();
        }
      }
      const pause = checkpoint();
      if (pause) await pause;
    }
  }
  const evidence = [];
  for (const population of populations) {
    evidence.push({
      id: population.id,
      count: population.members.length,
      members: population.members,
      contrasts: population.contrasts.map((item) => item.summary),
    });
    const pause = checkpoint();
    if (pause) await pause;
  }
  return evidence;
}
