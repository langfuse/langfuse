import { describe, expect, it } from "vitest";
import {
  buildNamingEvidence,
  buildTopicPrototypes,
  classifyTopic,
  normalizeVector,
} from "./classifier";
import type { TopicSummary } from "@langfuse/shared/topics";

describe("Topics original-space classifier", () => {
  it("preserves the leave-one-out radius when member vectors nearly cancel", () => {
    const summaries = [
      { id: "a", embedding: [Math.cos(5), Math.sin(5)] },
      { id: "b", embedding: [1, 0] },
      { id: "c", embedding: [-1, 1e-11] },
    ];
    const [prototype] = buildTopicPrototypes(summaries, [0, 0, 0]);
    expect(prototype.radius).toBeCloseTo(1.9431462087521165, 12);
  });

  it("accepts exact duplicates at the radius boundary without admitting distinct vectors", () => {
    const embedding = Array.from(new Float32Array([0.7, 0.3, 0.1]));
    const summaries = Array.from({ length: 6 }, (_, index) => ({
      id: String(index),
      embedding: index < 3 ? embedding : [0, 1, 0],
    }));
    const prototypes = buildTopicPrototypes(summaries, [0, 0, 0, 1, 1, 1]);
    expect(classifyTopic(embedding, prototypes)).toMatchObject({
      topicId: "cluster_0",
    });
    expect(classifyTopic([0.7, 0.3, 0.11], prototypes)).toMatchObject({
      topicId: null,
    });
  });

  it("names effective members and preserves assignments through JSON persistence", () => {
    const summaries = Array.from({ length: 40 }, (_, i) => ({
      id: `s${i}`,
      summary: `Example ${i}`,
      embedding:
        i < 20 ? [1, Math.sin(i) * 0.03, 0] : [Math.sin(i) * 0.03, 1, 0],
    })) as TopicSummary[];
    const labels = summaries.map((_, i) => (i < 20 ? 0 : 1));
    labels[0] = -1;
    const prototypes = buildTopicPrototypes(summaries, labels);
    const persisted = JSON.parse(
      JSON.stringify(prototypes),
    ) as typeof prototypes;
    const evidence = buildNamingEvidence(summaries, prototypes);
    expect(evidence).toHaveLength(2);
    for (const group of evidence) {
      expect(group.count).toBeGreaterThan(15);
      expect(group.members).toHaveLength(group.count);
      for (const member of group.members) {
        const summary = summaries.find((row) => row.id === member.id)!;
        expect(classifyTopic(summary.embedding, persisted).topicId).toBe(
          group.id,
        );
      }
      for (const contrast of group.contrasts) {
        expect(
          classifyTopic(
            summaries.find((row) => row.id === contrast.id)!.embedding,
            persisted,
          ).topicId,
        ).not.toBe(group.id);
      }
    }
    expect(classifyTopic([0, 0, 1], prototypes)).toMatchObject({
      topicId: null,
    });
    expect(
      classifyTopic(summaries[0].embedding, prototypes).topicId,
    ).not.toBeNull();
  });

  it("calibrates with leave-one-out distances and never falls through to a farther topic", () => {
    const summaries = [
      { id: "a", embedding: [1, 0] },
      { id: "b", embedding: [0.8, 0.6] },
      { id: "c", embedding: [0.8, -0.6] },
    ];
    const [prototype] = buildTopicPrototypes(summaries, [0, 0, 0]);
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
});
