import { describe, expect, it } from "vitest";
import type { TopicDefinition } from "@langfuse/shared/topics";
import { matchTopicContinuity } from "./continuity";

const topic = (id: string, centroid = [1, 0]): TopicDefinition => ({
  topicVersionId: id,
  topicId: `stable-${id}`,
  projectId: "project",
  runId: "run",
  name: id,
  description: id,
  centroid,
  radius: 0.3,
  representativeSummaryIds: [],
  metadata: { retained: true },
});

const members = (id: string | null, count: number, start = 0) =>
  Array.from({ length: count }, (_, index) => ({
    traceId: `trace-${index + start}`,
    topicVersionId: id,
  }));

const match = (
  previousMemberships: ReturnType<typeof members>,
  candidateMemberships: ReturnType<typeof members>,
  previousTopics = [topic("old")],
  candidateTopics = [topic("candidate")],
) =>
  matchTopicContinuity({
    previousTopics,
    candidateTopics,
    previousMemberships,
    candidateMemberships,
    exploratory: false,
    compatibleEmbeddingSpace: true,
  });

describe("Topics identity continuity", () => {
  it("inherits stable identity after growth without altering immutable versions or inputs", () => {
    const candidates = [topic("candidate")];
    const previous = members("old", 20);
    const current = members("candidate", 30);
    const [result] = match(previous, current, undefined, candidates);
    expect(result).toMatchObject({
      topicId: "stable-old",
      topicVersionId: "candidate",
      metadata: {
        retained: true,
        predecessorTopicIds: ["stable-old"],
        continuity: { status: "continued", sharedCount: 20 },
      },
    });
    expect(candidates[0].topicId).toBe("stable-candidate");
    expect(match([...previous].reverse(), [...current].reverse())).toEqual([
      result,
    ]);
  });

  it("gives all material split children new identities, including a dominant 80% child", () => {
    const result = match(
      members("old", 30),
      [...members("large", 24), ...members("small", 6, 24)],
      undefined,
      [topic("large"), topic("small")],
    );
    expect(result.map((row) => row.topicId)).toEqual([
      "stable-large",
      "stable-small",
    ]);
    for (const row of result)
      expect(row.metadata).toMatchObject({
        predecessorTopicIds: ["stable-old"],
        continuity: { status: "split" },
      });
  });

  it("records both predecessors for a merge but ignores tiny boundary movements", () => {
    const old = [...members("old-a", 20), ...members("old-b", 20, 20)];
    const topics = [topic("old-a"), topic("old-b")];
    const [merged] = match(old, members("candidate", 40), topics);
    expect(merged.topicId).toBe("stable-candidate");
    expect(merged.metadata).toMatchObject({
      predecessorTopicIds: ["stable-old-a", "stable-old-b"],
      continuity: { status: "merge" },
    });
    const retained = match(
      old,
      [...members("a", 21), ...members("b", 19, 21)],
      topics,
      [topic("a"), topic("b")],
    );
    expect(retained.map((row) => row.topicId)).toEqual([
      "stable-old-a",
      "stable-old-b",
    ]);
  });

  it("does not infer identity from unchanged centroids or a tiny surviving cohort", () => {
    expect(
      match(members("old", 20), members("candidate", 20, 30))[0].topicId,
    ).toBe("stable-candidate");
    expect(
      match(members("old", 100), members("candidate", 10))[0].topicId,
    ).toBe("stable-candidate");
  });

  it("keeps outliers in overlap denominators and refuses symmetric split/merge matches", () => {
    expect(
      match(
        [...members("old", 20), ...members(null, 20, 20)],
        members("candidate", 40),
      )[0].topicId,
    ).toBe("stable-candidate");
    expect(
      match(members("old", 20), [
        ...members("candidate", 10),
        ...members(null, 10, 10),
      ])[0].topicId,
    ).toBe("stable-candidate");
    const ambiguous = match(
      [...members("old-a", 20), ...members("old-b", 20, 20)],
      [
        ...members("a", 10),
        ...members("b", 10, 10),
        ...members("a", 10, 20),
        ...members("b", 10, 30),
      ],
      [topic("old-a"), topic("old-b")],
      [topic("a"), topic("b")],
    );
    expect(ambiguous.map((row) => row.topicId)).toEqual([
      "stable-a",
      "stable-b",
    ]);
    expect(
      ambiguous.every(
        (row) =>
          (row.metadata.continuity as { status: string }).status ===
          "ambiguous",
      ),
    ).toBe(true);
  });

  it("vetoes semantic centroid jumps but permits dimension-only changes with strong membership evidence", () => {
    const previousMemberships = members("old", 20);
    const candidateMemberships = members("candidate", 20);
    expect(
      match(previousMemberships, candidateMemberships, undefined, [
        topic("candidate", [0, 1]),
      ])[0].topicId,
    ).toBe("stable-candidate");
    const [changedDimensions] = matchTopicContinuity({
      previousTopics: [topic("old")],
      candidateTopics: [topic("candidate", [1, 0, 0])],
      previousMemberships,
      candidateMemberships,
      exploratory: false,
      compatibleEmbeddingSpace: false,
    });
    expect(changedDimensions.topicId).toBe("stable-old");
    expect(changedDimensions.metadata.continuity).toMatchObject({
      centroidDistance: null,
    });
  });

  it("uses exploratory support without allowing duplicate rows to inflate evidence", () => {
    const previousMemberships = members("old", 3);
    const candidateMemberships = members("candidate", 3);
    const input = {
      previousTopics: [topic("old")],
      candidateTopics: [topic("candidate")],
      previousMemberships,
      candidateMemberships,
      exploratory: true,
      compatibleEmbeddingSpace: true,
    };
    expect(matchTopicContinuity(input)[0].topicId).toBe("stable-old");
    expect(match(previousMemberships, candidateMemberships)[0].topicId).toBe(
      "stable-candidate",
    );
    expect(
      matchTopicContinuity({
        ...input,
        previousMemberships: Array(10).fill(previousMemberships[0]),
        candidateMemberships: Array(10).fill(candidateMemberships[0]),
      })[0].topicId,
    ).toBe("stable-candidate");
    expect(() =>
      matchTopicContinuity({
        ...input,
        candidateMemberships: [
          ...candidateMemberships,
          { ...candidateMemberships[0], topicVersionId: null },
        ],
      }),
    ).toThrow("conflicting");
  });
});
