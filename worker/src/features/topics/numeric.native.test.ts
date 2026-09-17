import { expect, it } from "vitest";
import { buildTopicPrototypes, classifyTopic } from "./classifier";
import { runTopicClustering } from "./numeric";

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
  const result = await runTopicClustering(embeddings, false);
  expect(result.status).toBe("complete");
  expect(result.labels).toHaveLength(1002);
  expect(result.coordinates).toHaveLength(1002);
  expect(
    result.coordinates.every((point) => point.every(Number.isFinite)),
  ).toBe(true);
  const groups = new Set(result.labels.filter((label) => label >= 0));
  expect(groups.size).toBe(2);
  for (const start of [0, 501]) {
    const labels = result.labels.slice(start, start + 501);
    expect(
      labels.filter((label) => label === labels[0]).length,
    ).toBeGreaterThan(490);
  }
  expect(result.labels[0]).not.toBe(result.labels[501]);

  const prototypes = buildTopicPrototypes(
    embeddings.map((embedding, index) => ({ id: String(index), embedding })),
    result.labels,
  );
  const assignments = [0, 1].map(
    (dimension) =>
      classifyTopic(
        Array.from({ length: 16 }, (_, index) => (index === dimension ? 1 : 0)),
        prototypes,
      ).topicId,
  );
  expect(assignments.every((id) => id !== null)).toBe(true);
  expect(new Set(assignments).size).toBe(2);
}, 30_000);

it("preserves insufficient-data and identical-input outcomes through the worker adapter", async () => {
  expect(await runTopicClustering([[1, 0]], false)).toEqual({
    status: "insufficient_data",
    labels: [],
    coordinates: [],
  });
  expect(
    await runTopicClustering(
      Array.from({ length: 100 }, () => [1, 0]),
      false,
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
      true,
    ),
  ).rejects.toThrow("nonzero embedding");
});
