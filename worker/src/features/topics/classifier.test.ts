import { describe, expect, it } from "vitest";
import type { TopicSummary } from "@langfuse/shared/topics";
import {
  buildNamingEvidence,
  buildTopicPrototypes,
  classifyTopic,
  normalizeVector,
  retainPopulatedTopics,
} from "./classifier";

describe("Topics original-space classifier", () => {
  it("lets queued work run before a naming cohort has finished processing", async () => {
    let reads = 0;
    let readsWhenScheduledWorkRan = 0;
    let scheduled: NodeJS.Immediate | undefined;
    const summaries = Array.from({ length: 512 }, (_, index) => ({
      projectId: "project",
      facetId: "facet",
      facetVersion: 1,
      traceId: String(index),
      sessionId: null,
      summary: `Example ${index}`,
      get embedding() {
        reads++;
        scheduled ??= setImmediate(() => {
          readsWhenScheduledWorkRan = reads;
        });
        return index % 2 ? [1, 0] : [0, 1];
      },
    })) as TopicSummary[];
    try {
      await buildNamingEvidence(summaries, [
        { id: "a", centroid: [1, 0], radius: 0 },
        { id: "b", centroid: [0, 1], radius: 0 },
      ]);
      expect(readsWhenScheduledWorkRan).toBeGreaterThan(0);
      expect(readsWhenScheduledWorkRan).toBeLessThan(summaries.length);
    } finally {
      clearImmediate(scheduled);
    }
  });

  it("drops a boundary-only topic when a reused version wins distance ties", async () => {
    const summaries = [{ embedding: [1, 0] }, { embedding: [1, 1] }];
    const candidate = { id: "b", centroid: [0, 1], radius: 0.4 };
    const other = { id: "c", centroid: [1, 0], radius: 0.4 };
    expect(await retainPopulatedTopics(summaries, [candidate, other])).toEqual([
      candidate,
      other,
    ]);
    const reused = { ...other, id: "a" };
    expect(await retainPopulatedTopics(summaries, [candidate, reused])).toEqual(
      [reused],
    );
  });

  it("preserves the leave-one-out radius when member vectors nearly cancel", async () => {
    const summaries = [
      { id: "a", embedding: [Math.cos(5), Math.sin(5)] },
      { id: "b", embedding: [1, 0] },
      { id: "c", embedding: [-1, 1e-11] },
    ];
    const [prototype] = await buildTopicPrototypes(summaries, [0, 0, 0]);
    expect(prototype.radius).toBeCloseTo(1.9431462087521165, 12);
  });

  it("accepts exact duplicates at the radius boundary without admitting distinct vectors", async () => {
    const embedding = Array.from(new Float32Array([0.7, 0.3, 0.1]));
    const summaries = Array.from({ length: 6 }, (_, index) => ({
      id: String(index),
      embedding: index < 3 ? embedding : [0, 1, 0],
    }));
    const prototypes = await buildTopicPrototypes(
      summaries,
      [0, 0, 0, 1, 1, 1],
    );
    expect(classifyTopic(embedding, prototypes)).toMatchObject({
      topicId: "cluster_0",
    });
    expect(classifyTopic([0.7, 0.3, 0.11], prototypes)).toMatchObject({
      topicId: null,
    });
  });

  it("calibrates with leave-one-out distances and never falls through to a farther topic", async () => {
    const summaries = [
      { id: "a", embedding: [1, 0] },
      { id: "b", embedding: [0.8, 0.6] },
      { id: "c", embedding: [0.8, -0.6] },
    ];
    const [prototype] = await buildTopicPrototypes(summaries, [0, 0, 0]);
    expect(prototype.radius).toBeCloseTo(1 - 1.08 / Math.hypot(1.8, 0.6), 12);
    const result = classifyTopic(
      [1, 0],
      [
        { id: "nearest", centroid: normalizeVector([1, 0.1]), radius: 0 },
        { id: "farther", centroid: [0, 1], radius: 2 },
      ],
    );
    expect(result.topicId).toBeNull();
    expect(() => classifyTopic([0, 0], [prototype])).toThrow("zero norm");
    expect(() => classifyTopic([1, 0, 0], [prototype])).toThrow("dimensions");
  });

  it("keeps source ordering for tied members and input ordering for tied contrasts", async () => {
    const summary = (traceId: string, embedding: number[]) =>
      ({
        projectId: "project",
        facetId: "facet",
        facetVersion: 1,
        traceId,
        sessionId: null,
        summary: traceId,
        embedding,
      }) as TopicSummary;
    const summaries = [
      summary("z-member", [1, 0]),
      summary("z-other", [0, 1]),
      summary("a-member", [1, 0]),
      summary("a-other", [0, 1]),
      summary("m-other", [0, 1]),
      summary("outlier", [0.8, 0.6]),
    ];
    const groups = await buildNamingEvidence(summaries, [
      { id: "a", centroid: [1, 0], radius: 0 },
      { id: "b", centroid: [0, 1], radius: 0 },
    ]);
    expect(
      groups.map((group) => ({
        id: group.id,
        count: group.count,
        members: group.members.map((member) => member.traceId),
        contrasts: group.contrasts.map((contrast) => contrast.traceId),
      })),
    ).toEqual([
      {
        id: "a",
        count: 2,
        members: ["a-member", "z-member"],
        contrasts: ["outlier", "z-other", "a-other"],
      },
      {
        id: "b",
        count: 3,
        members: ["a-other", "m-other", "z-other"],
        contrasts: ["outlier", "z-member", "a-member"],
      },
    ]);
  });

  it("preserves the runner-up and final version ID tie-break without normalizing stored centroids", () => {
    expect(
      classifyTopic(
        [1, 0],
        [
          { id: "b", centroid: [1, 0], radius: 0 },
          { id: "a", centroid: [1, 0], radius: 0 },
          { id: "c", centroid: [0, 1], radius: 2 },
        ],
      ),
    ).toEqual({ topicId: "a", distance: 0, runnerUpDistance: 0 });
    expect(
      classifyTopic(
        [1, 0],
        [
          { id: "a", centroid: [1 - 4 * Number.EPSILON, 0], radius: 0 },
          { id: "b", centroid: [1, 0], radius: 0 },
        ],
      ),
    ).toEqual({
      topicId: "b",
      distance: 0,
      runnerUpDistance: 4 * Number.EPSILON,
    });
  });

  it("reclassifies outliers after removing their unused nearest prototype", async () => {
    const summaries = [{ embedding: [1, 0] }, { embedding: [0, 1] }];
    const unused = {
      id: "unused",
      centroid: normalizeVector([1, 0.1]),
      radius: 0,
    };
    const populated = { id: "populated", centroid: [0, 1], radius: 1 };
    const retained = await retainPopulatedTopics(summaries, [
      unused,
      populated,
    ]);
    expect(retained).toEqual([populated]);
    expect(
      summaries.map(
        ({ embedding }) => classifyTopic(embedding, retained).topicId,
      ),
    ).toEqual(["populated", "populated"]);
  });
});
