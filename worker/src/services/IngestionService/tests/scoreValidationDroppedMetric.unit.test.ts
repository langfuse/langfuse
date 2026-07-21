/**
 * LFE-14345: `langfuse.ingestion.metadata_dropped` counter at the score
 * validation drop site (catch in processScoreEventList).
 *
 * Spec under test:
 * - The catch that silently filters score events on validation failure
 *   (InvalidRequestError / LangfuseNotFoundError) emits the counter with
 *   reason=score_validation_dropped, domain=score, source=api.
 * - Existing behavior is preserved: the event is still filtered, valid
 *   events in the same batch are still written, unexpected errors still
 *   reject the batch (and must NOT emit the drop counter — a rejected
 *   batch is retried, not silently lost).
 * - project_id is NOT a metric tag; tenant attribution via a log line
 *   that includes the projectId.
 */
import { expect, describe, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  recordIncrement: vi.fn(),
  // When set, replaces validateAndInflateScore for the next calls.
  validateAndInflateScoreOverride: undefined as
    | ((...args: unknown[]) => unknown)
    | undefined,
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    recordIncrement: mocks.recordIncrement,
    validateAndInflateScore: (...args: unknown[]) =>
      mocks.validateAndInflateScoreOverride
        ? mocks.validateAndInflateScoreOverride(...args)
        : (actual.validateAndInflateScore as (...a: unknown[]) => unknown)(
            ...args,
          ),
  };
});

import { IngestionService } from "../../IngestionService";
import { logger, type ScoreEventType } from "@langfuse/shared/src/server";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { TableName } from "../../ClickhouseWriter";

const METRIC = "langfuse.ingestion.metadata_dropped";
const PROJECT_ID = "test-project-lfe-14345";
const TIMESTAMP = "2024-10-12T12:13:14.123Z";

const droppedCalls = () =>
  mocks.recordIncrement.mock.calls.filter(([stat]) => stat === METRIC);

const expectScoreDropTags = (call: unknown[]) => {
  const [, value, tags] = call as [
    string,
    number | undefined,
    Record<string, string | number>,
  ];
  expect(value ?? 1).toBe(1);
  expect(tags).toEqual(
    expect.objectContaining({
      reason: "score_validation_dropped",
      source: "api",
      domain: "score",
    }),
  );
  // Acceptance criterion: project_id is NOT a metric tag (cardinality).
  expect(Object.keys(tags ?? {})).not.toContain("project_id");
  expect(Object.keys(tags ?? {})).not.toContain("projectId");
};

const createService = () => {
  const addToQueue = vi.fn();
  const ingestionService = new IngestionService(
    {} as any,
    {} as any,
    { addToQueue } as any,
    {} as any,
  );
  vi.spyOn(ingestionService as any, "getClickhouseRecord").mockResolvedValue(
    null,
  );
  return { ingestionService, addToQueue };
};

const scoreEvent = (body: Record<string, unknown>): ScoreEventType =>
  ({
    id: "event-id",
    timestamp: TIMESTAMP,
    type: "score-create",
    body: {
      id: "score-id",
      dataType: "NUMERIC",
      source: "API",
      traceId: "trace-id",
      environment: "default",
      ...body,
    },
  }) as ScoreEventType;

const invalidScoreEvent = () =>
  scoreEvent({ name: "invalid-score", value: "not-a-number" });

const validScoreEvent = () => scoreEvent({ name: "valid-score", value: 1 });

const processScores = (
  ingestionService: IngestionService,
  scoreEventList: ScoreEventType[],
) =>
  (ingestionService as any).processScoreEventList({
    projectId: PROJECT_ID,
    entityId: "score-id",
    createdAtTimestamp: new Date(TIMESTAMP),
    scoreEventList,
    attribution: {
      ingestionApiKey: "pk-lf-unit-test",
      ingestionSdkName: "langfuse-test",
      ingestionSdkVersion: "0.0.0",
    },
  });

describe("score validation drop metric (LFE-14345)", () => {
  beforeEach(() => {
    mocks.recordIncrement.mockClear();
    mocks.validateAndInflateScoreOverride = undefined;
    vi.restoreAllMocks();
  });

  it("emits score_validation_dropped when a score fails validation (InvalidRequestError path)", async () => {
    const { ingestionService, addToQueue } = createService();
    const loggerCalls: unknown[][] = [];
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
        loggerCalls.push(args);
        return logger;
      });
    }

    // Existing behavior: batch with no valid records is silently rejected.
    await expect(
      processScores(ingestionService, [invalidScoreEvent()]),
    ).resolves.toBeUndefined();
    expect(addToQueue).not.toHaveBeenCalled();

    const calls = droppedCalls();
    expect(calls).toHaveLength(1);
    expectScoreDropTags(calls[0]);

    // Acceptance criterion: tenant attribution via logs — a log line
    // emitted during the drop includes the projectId.
    expect(JSON.stringify(loggerCalls)).toContain(PROJECT_ID);
  });

  it("emits score_validation_dropped when validation throws LangfuseNotFoundError", async () => {
    const { ingestionService, addToQueue } = createService();
    mocks.validateAndInflateScoreOverride = () =>
      Promise.reject(new LangfuseNotFoundError("score config not found"));

    await expect(
      processScores(ingestionService, [validScoreEvent()]),
    ).resolves.toBeUndefined();
    expect(addToQueue).not.toHaveBeenCalled();

    const calls = droppedCalls();
    expect(calls).toHaveLength(1);
    expectScoreDropTags(calls[0]);
  });

  it("increments once per dropped event and still writes the valid score of a mixed batch", async () => {
    const { ingestionService, addToQueue } = createService();

    await expect(
      processScores(ingestionService, [invalidScoreEvent(), validScoreEvent()]),
    ).resolves.toBeUndefined();

    // Existing behavior: the valid score is still written.
    const scoreWrite = addToQueue.mock.calls.find(
      ([table]) => table === TableName.Scores,
    );
    expect(scoreWrite).toBeDefined();

    const calls = droppedCalls();
    expect(calls).toHaveLength(1);
    expectScoreDropTags(calls[0]);
  });

  it("does not emit for a batch of valid scores", async () => {
    const { ingestionService, addToQueue } = createService();

    await expect(
      processScores(ingestionService, [validScoreEvent()]),
    ).resolves.toBeUndefined();

    expect(
      addToQueue.mock.calls.find(([table]) => table === TableName.Scores),
    ).toBeDefined();
    expect(droppedCalls()).toHaveLength(0);
  });

  it("does not emit for unexpected errors — those reject the batch instead of dropping it", async () => {
    const { ingestionService, addToQueue } = createService();
    vi.spyOn(
      ingestionService as any,
      "getMillisecondTimestamp",
    ).mockImplementation(() => {
      throw new Error("unexpected timestamp failure");
    });

    await expect(
      processScores(ingestionService, [validScoreEvent()]),
    ).rejects.toThrow("Unexpected error(s) validating score batch");

    expect(addToQueue).not.toHaveBeenCalled();
    expect(droppedCalls()).toHaveLength(0);
  });

  it("does not emit when a rethrowing batch also contains an expected validation failure (retry overcount)", async () => {
    // Greptile finding on PR #15269 / extended ruling: a batch containing
    // ANY unexpected error rejects and gets redelivered — counting the
    // expected drop on such an attempt inflates the metric once per retry.
    // Drops are counted only on the attempt that completes.
    const { ingestionService, addToQueue } = createService();

    let validationCall = 0;
    mocks.validateAndInflateScoreOverride = () => {
      validationCall += 1;
      return validationCall === 1
        ? Promise.reject(new InvalidRequestError("expected validation drop"))
        : Promise.reject(new Error("unexpected validation crash"));
    };

    await expect(
      processScores(ingestionService, [validScoreEvent(), validScoreEvent()]),
    ).rejects.toThrow("Unexpected error(s) validating score batch");

    // Both events were validated: one expected drop + one unexpected error.
    expect(validationCall).toBe(2);
    expect(addToQueue).not.toHaveBeenCalled();
    expect(droppedCalls()).toHaveLength(0);
  });
});
