import { createHash } from "node:crypto";
import type { TopicSummary } from "@langfuse/shared/topics";

export interface TopicPrototype {
  id: string;
  centroid: number[];
  radius: number;
  seedSummaryIds: string[];
}

export function topicHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function normalizeVector(vector: number[]): number[] {
  if (!vector.length || vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid topic embedding");
  }
  const norm = Math.hypot(...vector);
  if (norm < 1e-12) throw new Error("Topic embedding has zero norm");
  return vector.map((value) => value / norm);
}

function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length)
    throw new Error("Topic embedding dimensions differ");
  return Math.max(
    0,
    Math.min(2, 1 - a.reduce((sum, value, i) => sum + value * b[i], 0)),
  );
}

function centroid(vectors: number[][]): number[] {
  return normalizeVector(
    vectors[0].map(
      (_, i) =>
        vectors.reduce((sum, vector) => sum + vector[i], 0) / vectors.length,
    ),
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
export function buildTopicPrototypes(
  summaries: Pick<TopicSummary, "id" | "embedding">[],
  labels: number[],
): TopicPrototype[] {
  if (labels.length !== summaries.length)
    throw new Error("Clustering result length mismatch");
  const vectors = summaries.map((summary) =>
    normalizeVector(summary.embedding),
  );
  const groups = [...new Set(labels.filter((label) => label >= 0))]
    .sort((a, b) => a - b)
    .map((label) => {
      const indices = labels.flatMap((value, i) =>
        value === label ? [i] : [],
      );
      return {
        label,
        indices,
        centroid: centroid(indices.map((i) => vectors[i])),
      };
    });
  return groups.map((group) => {
    const positives = group.indices.map((index) => {
      const others = group.indices.filter((i) => i !== index);
      return others.length
        ? cosineDistance(
            vectors[index],
            centroid(others.map((i) => vectors[i])),
          )
        : 0;
    });
    const rival = groups
      .filter((candidate) => candidate !== group)
      .sort(
        (a, b) =>
          cosineDistance(group.centroid, a.centroid) -
          cosineDistance(group.centroid, b.centroid),
      )[0];
    const cap = rival
      ? quantile(
          rival.indices.map((i) => cosineDistance(vectors[i], group.centroid)),
          0.05,
        )
      : 2;
    return {
      id: `cluster_${group.label}`,
      centroid: group.centroid,
      radius: Math.min(quantile(positives, 0.95), cap),
      seedSummaryIds: group.indices.map((i) => summaries[i].id),
    };
  });
}

export function classifyTopic(
  embedding: number[],
  prototypes: Pick<TopicPrototype, "id" | "centroid" | "radius">[],
) {
  const vector = normalizeVector(embedding);
  const ranked = prototypes
    .map((prototype) => ({
      ...prototype,
      distance: cosineDistance(vector, prototype.centroid),
    }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  const nearest = ranked[0];
  // Normalization and centroid averaging can differ by floating-point roundoff.
  const accepted = nearest && nearest.distance <= nearest.radius + 1e-12;
  return {
    topicId: accepted ? nearest.id : null,
    distance: nearest?.distance ?? null,
    runnerUpDistance: ranked[1]?.distance ?? null,
    rejectionReason: !nearest ? "no_topics" : !accepted ? "outside_radius" : "",
  };
}

/** Names only populations produced by the same classifier used for new traces. */
export function buildNamingEvidence(
  summaries: TopicSummary[],
  prototypes: TopicPrototype[],
) {
  const assignments = summaries.map((summary) => ({
    summary,
    result: classifyTopic(summary.embedding, prototypes),
  }));
  return prototypes.map((prototype) => {
    const members = assignments
      .filter((item) => item.result.topicId === prototype.id)
      .sort(
        (a, b) =>
          (a.result.distance ?? 0) - (b.result.distance ?? 0) ||
          a.summary.id.localeCompare(b.summary.id),
      );
    const contrasts = assignments
      .filter((item) => item.result.topicId !== prototype.id)
      .sort(
        (a, b) =>
          cosineDistance(
            normalizeVector(a.summary.embedding),
            prototype.centroid,
          ) -
          cosineDistance(
            normalizeVector(b.summary.embedding),
            prototype.centroid,
          ),
      )
      .slice(0, 3)
      .map((item) => ({ id: item.summary.id, summary: item.summary.summary }));
    return {
      id: prototype.id,
      count: members.length,
      members: members.map(({ summary }) => ({
        id: summary.id,
        summary: summary.summary,
      })),
      contrasts,
    };
  });
}
