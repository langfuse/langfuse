// @vitest-environment node

import { type ScoreConfigDomain, type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { selectReadOnlyItemScores } from "@/src/features/annotation-queues/lib/readOnlyItemScores";

const queueConfig: ScoreConfigDomain = {
  id: "cfg-queue",
  name: "Accuracy",
  dataType: "NUMERIC",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  projectId: "project-1",
};

function score(
  overrides: Partial<WithStringifiedMetadata<ScoreDomain>> &
    Pick<WithStringifiedMetadata<ScoreDomain>, "id" | "source">,
): WithStringifiedMetadata<ScoreDomain> {
  return {
    name: overrides.id,
    dataType: "NUMERIC",
    value: 1,
    stringValue: null,
    configId: null,
    comment: null,
    traceId: "trace-1",
    observationId: null,
    sessionId: null,
    projectId: "project-1",
    environment: "default",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    authorUserId: null,
    queueId: null,
    datasetRunId: null,
    executionTraceId: null,
    metadata: null,
    longStringValue: "",
    ...overrides,
  };
}

describe("selectReadOnlyItemScores", () => {
  it("keeps every score on the item except annotation scores for the queue configs", () => {
    const scores = [
      score({
        id: "queue-ann",
        source: "ANNOTATION",
        configId: queueConfig.id,
      }),
      score({
        id: "other-ann",
        source: "ANNOTATION",
        configId: "cfg-other",
      }),
      score({ id: "eval", source: "EVAL", configId: queueConfig.id }),
      score({ id: "api", source: "API" }),
      score({
        id: "child-eval",
        source: "EVAL",
        observationId: "obs-1",
      }),
      score({
        id: "other-session",
        source: "API",
        traceId: null,
        sessionId: "sess-1",
      }),
    ];

    expect(
      selectReadOnlyItemScores(scores, { type: "trace", traceId: "trace-1" }, [
        queueConfig,
      ]).map((item) => item.id),
    ).toEqual(["other-ann", "eval", "api"]);

    expect(
      selectReadOnlyItemScores(
        scores,
        { type: "trace", traceId: "trace-1", observationId: "obs-1" },
        [queueConfig],
      ).map((item) => item.id),
    ).toEqual(["child-eval"]);

    expect(
      selectReadOnlyItemScores(
        [
          score({
            id: "sess-ann",
            source: "ANNOTATION",
            configId: queueConfig.id,
            traceId: null,
            sessionId: "sess-1",
          }),
          score({
            id: "sess-eval",
            source: "EVAL",
            traceId: null,
            sessionId: "sess-1",
          }),
          score({
            id: "sess-api",
            source: "API",
            traceId: null,
            sessionId: "sess-1",
          }),
          score({
            id: "sess-other-ann",
            source: "ANNOTATION",
            configId: "cfg-other",
            traceId: null,
            sessionId: "sess-1",
          }),
        ],
        { type: "session", sessionId: "sess-1" },
        [queueConfig],
      ).map((item) => item.id),
    ).toEqual(["sess-eval", "sess-api", "sess-other-ann"]);
  });
});
