import { expect, it } from "vitest";
import type { TopicSummary } from "@langfuse/shared/topics";
import {
  buildNamingEvidence,
  buildTopicPrototypes,
  classifyTopic,
} from "./classifier";
import { runTopicClustering, TOPIC_CLUSTER_SETTINGS } from "./numeric";

it("fits every member through the native child and builds usable serving prototypes", async () => {
  let seed = 42;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const embeddings = Array.from({ length: 1002 }, (_, index) =>
    Array.from(
      { length: 16 },
      (_, dimension) =>
        (dimension === Math.floor(index / 501) ? 1 : 0) +
        (random() - 0.5) * 0.05,
    ),
  );
  const result = await runTopicClustering(embeddings, TOPIC_CLUSTER_SETTINGS);
  expect(result.status).toBe("complete");
  const groups = new Set(result.labels.filter((label) => label >= 0));
  expect(groups.size).toBe(2);
  for (const start of [0, 501]) {
    const labels = result.labels.slice(start, start + 501);
    expect(
      labels.filter((label) => label === labels[0]).length,
    ).toBeGreaterThan(490);
  }
  expect(result.labels[0]).not.toBe(result.labels[501]);

  const summaries = embeddings.map((embedding, index) => ({
    projectId: "project",
    facetId: "facet",
    facetVersion: 1,
    traceId: String(index),
    sessionId: null,
    summary: `Example ${index}`,
    embedding,
  })) as TopicSummary[];
  const labels = [...result.labels];
  labels[0] = -1;
  const prototypes = await buildTopicPrototypes(summaries, labels);
  const persisted = JSON.parse(JSON.stringify(prototypes)) as typeof prototypes;
  const evidence = await buildNamingEvidence(summaries, prototypes);
  expect(evidence).toHaveLength(2);
  for (const group of evidence) {
    expect(group.count).toBeGreaterThan(450);
    expect(group.members).toHaveLength(group.count);
    for (const member of group.members)
      expect(classifyTopic(member.embedding, persisted).topicId).toBe(group.id);
    for (const contrast of group.contrasts)
      expect(classifyTopic(contrast.embedding, persisted).topicId).not.toBe(
        group.id,
      );
  }
  expect(classifyTopic(embeddings[0], persisted).topicId).not.toBeNull();
  expect(
    classifyTopic([0, 0, 1, ...Array(13).fill(0)], persisted).topicId,
  ).toBeNull();
  const assignments = [0, 1].map(
    (dimension) =>
      classifyTopic(
        Array.from({ length: 16 }, (_, index) => (index === dimension ? 1 : 0)),
        persisted,
      ).topicId,
  );
  expect(assignments.every((id) => id !== null)).toBe(true);
  expect(new Set(assignments).size).toBe(2);
}, 30_000);

it("preserves insufficient-data and proportional-input outcomes through the worker adapter", async () => {
  expect(await runTopicClustering([[1, 0]], TOPIC_CLUSTER_SETTINGS)).toEqual({
    status: "insufficient_data",
    labels: [],
    coordinates: [],
  });
  expect(
    await runTopicClustering(
      Array.from({ length: 100 }, (_, index) => [index + 1, 0]),
      TOPIC_CLUSTER_SETTINGS,
    ),
  ).toEqual({
    status: "no_topics",
    labels: Array(100).fill(-1),
    coordinates: Array(100).fill([0, 0]),
  });
});

it("surfaces invalid vectors from the native child without crashing the worker", async () => {
  await expect(
    runTopicClustering(
      Array.from({ length: 10 }, () => [0, 0]),
      TOPIC_CLUSTER_SETTINGS,
    ),
  ).rejects.toThrow("nonzero embedding");
});
