import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EvalTemplateType,
  LangfuseInternalTraceEnvironment,
  TopicsTargetObject,
} from "@langfuse/shared";
import { Prisma } from "@langfuse/shared/src/db";
import { logger, recordIncrement } from "@langfuse/shared/src/server";
import { createEvalSchedulerDeps, scheduleEvals } from "../scheduleEvals";
import type { EvalRules } from "../fetchEvalRules";
import {
  createMockSchedulerDeps,
  createTestEvalConfig,
  createTestObservation,
} from "../observationEval/__tests__/fixtures";

const mocks = vi.hoisted(() => ({
  env: { LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE: 0 },
  topicsEnabled: vi.fn(),
  topicsActive: vi.fn(),
  createObservationDeps: vi.fn(),
  record: vi.fn(),
}));

vi.mock("../../../env", () => ({ env: mocks.env }));
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  recordIncrement: vi.fn(),
}));
vi.mock("@langfuse/shared/topics/server", () => ({
  isTopicsProjectEnabled: mocks.topicsEnabled,
  isTopicsProcessingActive: mocks.topicsActive,
  getTopicsProcessingSampling: async (projectId: string) =>
    (await mocks.topicsActive(projectId)) ? 1 : 0,
}));
vi.mock("../observationEval/createSchedulerDeps", () => ({
  createObservationEvalSchedulerDeps: mocks.createObservationDeps,
}));
vi.mock("../../traceBatching/traceRuleRecording", () => ({
  recordTraceActivity: async (projectId: string, events: unknown) =>
    mocks.record(projectId, structuredClone(events)),
}));

const projectId = "test-project-123";
const startTimeISO = "2026-11-02T08:00:00.000Z";
const createTraceActivity = (
  traceId: string,
  spanStartTimeISO = startTimeISO,
) => ({
  traceId,
  spanStartTimeISO,
});
const facetRule: EvalRules["traceTranscriptRules"][number] = {
  id: "facet-rule",
  ruleId: "facet-rule",
  projectId,
  targetObject: TopicsTargetObject,
  status: "ACTIVE",
  sampling: new Prisma.Decimal(1),
  filter: [
    { column: "name", type: "string", operator: "=", value: "selected" },
  ],
  assignments: [
    {
      id: "facet-assignment",
      evaluatorId: "facet",
      variableMapping: null,
      evaluator: { id: "facet", projectId, type: EvalTemplateType.FACET },
    },
  ],
};

describe("scheduleEvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE = 0;
    mocks.topicsEnabled.mockReturnValue(true);
    mocks.topicsActive.mockResolvedValue(true);
    mocks.record.mockResolvedValue(undefined);
  });

  it.each([true, false])(
    "preserves observation scheduling with trace recording=%s",
    async (recordTraces) => {
      const observationDeps = createMockSchedulerDeps();
      mocks.createObservationDeps.mockReturnValue(observationDeps);
      const rules: EvalRules = {
        observationRules: [createTestEvalConfig()],
        traceTranscriptRules: recordTraces ? [facetRule] : [],
      };
      const schedulerDeps = createEvalSchedulerDeps(projectId, rules);
      const observation = createTestObservation({ name: "selected" });
      const selected = await scheduleEvals({
        observation,
        traceActivity: recordTraces
          ? Object.freeze(createTraceActivity(observation.trace_id))
          : undefined,
        rules,
        schedulerDeps,
      });
      const unmatched = await scheduleEvals({
        observation: { ...observation, span_id: "child", name: "unmatched" },
        traceActivity: recordTraces
          ? createTraceActivity(
              observation.trace_id,
              "2026-11-02T08:01:00.000Z",
            )
          : undefined,
        rules,
        schedulerDeps,
      });
      await schedulerDeps.flushTraceActivity();

      expect(observationDeps.enqueueEvalJob).toHaveBeenCalledTimes(2);
      // Matching holds rule IDs. It does not buffer them for Redis.
      expect(mocks.record).not.toHaveBeenCalled();
      if (recordTraces) {
        expect(selected).toEqual([facetRule.id]);
        expect(unmatched).toEqual([]);
      } else {
        expect(selected).toBeUndefined();
        expect(unmatched).toBeUndefined();
        expect(mocks.topicsActive).not.toHaveBeenCalled();
      }
    },
  );

  it("keeps activity local to each ingestion batch until that batch flushes", async () => {
    mocks.createObservationDeps.mockImplementation(createMockSchedulerDeps);
    const rules: EvalRules = {
      observationRules: [],
      traceTranscriptRules: [facetRule],
    };
    const firstBatch = createEvalSchedulerDeps(projectId, rules);
    const secondBatch = createEvalSchedulerDeps(projectId, rules);
    const observation = createTestObservation({ name: "selected" });
    const matched = await Promise.all(
      [firstBatch, secondBatch].map((schedulerDeps, index) =>
        scheduleEvals({
          observation: { ...observation, trace_id: `trace-${index}` },
          traceActivity: createTraceActivity(`trace-${index}`),
          rules,
          schedulerDeps,
        }),
      ),
    );
    expect(mocks.record).not.toHaveBeenCalled();
    firstBatch.collectTraceActivity({
      ...createTraceActivity("trace-0"),
      ruleIds: matched[0] ?? [],
      serializedEventBytes: 120,
    });
    secondBatch.collectTraceActivity({
      ...createTraceActivity("trace-1"),
      ruleIds: matched[1] ?? [],
      serializedEventBytes: 240,
    });

    await firstBatch.flushTraceActivity();
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith(projectId, [
      {
        traceId: "trace-0",
        spanStartTimeISO: startTimeISO,
        ruleIds: [facetRule.id],
        serializedEventBytes: 120,
      },
    ]);
    await firstBatch.flushTraceActivity();
    expect(mocks.record).toHaveBeenCalledTimes(1);

    await secondBatch.flushTraceActivity();
    expect(mocks.record).toHaveBeenNthCalledWith(2, projectId, [
      {
        traceId: "trace-1",
        spanStartTimeISO: startTimeISO,
        ruleIds: [facetRule.id],
        serializedEventBytes: 240,
      },
    ]);
  });

  it("reports recording failures without rejecting the flush", async () => {
    const error = new Error("Redis unavailable");
    mocks.record.mockRejectedValueOnce(error);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    try {
      const schedulerDeps = createEvalSchedulerDeps(projectId, {
        observationRules: [],
        traceTranscriptRules: [],
      });
      schedulerDeps.collectTraceActivity({
        ...createTraceActivity("trace"),
        ruleIds: [facetRule.id],
        serializedEventBytes: 120,
      });

      await expect(schedulerDeps.flushTraceActivity()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        "Failed to record trace rule selections",
        { projectId, error },
      );
      expect(recordIncrement).toHaveBeenCalledWith(
        "langfuse.trace_dispatch.recording_batches",
        1,
        { outcome: "error" },
      );
    } finally {
      warn.mockRestore();
    }
  });

  it.each([true, false])(
    "adding a facet preserves experiment evaluations (observation rule=%s) and selects no Topics rules",
    async (hasObservationRule) => {
      const observation = createTestObservation({
        span_id: "root",
        name: "selected",
        environment: LangfuseInternalTraceEnvironment.PromptExperiments,
        experiment_item_root_span_id: "root",
      });
      const observationRule = createTestEvalConfig();
      for (const traceTranscriptRules of [[], [facetRule]]) {
        const observationDeps = createMockSchedulerDeps();
        mocks.createObservationDeps.mockReturnValue(observationDeps);
        const rules: EvalRules = {
          observationRules: hasObservationRule ? [observationRule] : [],
          traceTranscriptRules,
        };
        const schedulerDeps = createEvalSchedulerDeps(projectId, rules);
        const matchedRuleIds = [];
        for (const span_id of ["root", "child"]) {
          matchedRuleIds.push(
            await scheduleEvals({
              observation: { ...observation, span_id },
              traceActivity: createTraceActivity(observation.trace_id),
              rules,
              schedulerDeps,
            }),
          );
        }
        await schedulerDeps.flushTraceActivity();
        expect(matchedRuleIds).toEqual([undefined, undefined]);
        if (hasObservationRule) {
          expect(
            observationDeps.uploadObservationToS3,
          ).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ observationId: "root" }),
          );
        } else {
          expect(observationDeps.uploadObservationToS3).not.toHaveBeenCalled();
        }
        expect(observationDeps.enqueueEvalJob).toHaveBeenCalledTimes(
          hasObservationRule ? 1 : 0,
        );
      }
      expect(mocks.record).not.toHaveBeenCalled();
    },
  );
});
