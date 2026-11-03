import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EvalTemplateType,
  LangfuseInternalTraceEnvironment,
  TopicsTargetObject,
} from "@langfuse/shared";
import { Prisma } from "@langfuse/shared/src/db";
import { createEvalSchedulerDeps, scheduleEvals } from "../scheduleEvals";
import type { EvalRules } from "../fetchEvalRules";
import {
  createMockSchedulerDeps,
  createTestEvalConfig,
  createTestObservation,
} from "../observationEval/__tests__/fixtures";

const mocks = vi.hoisted(() => ({
  env: { LANGFUSE_TRACE_BATCH_SAMPLING_RATE: 0 },
  topicsEnabled: vi.fn(),
  topicsActive: vi.fn(),
  createObservationDeps: vi.fn(),
  record: vi.fn(),
}));

vi.mock("../../../env", () => ({ env: mocks.env }));
vi.mock("@langfuse/shared/topics/server", () => ({
  isTopicsProjectEnabled: mocks.topicsEnabled,
  isTopicsProcessingActive: mocks.topicsActive,
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
    mocks.env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = 0;
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
      await scheduleEvals({
        observation,
        traceActivity: recordTraces
          ? Object.freeze(createTraceActivity(observation.trace_id))
          : undefined,
        rules,
        schedulerDeps,
      });
      await scheduleEvals({
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
      if (recordTraces) {
        expect(mocks.record).toHaveBeenCalledExactlyOnceWith(projectId, [
          {
            traceId: observation.trace_id,
            spanStartTimeISO: startTimeISO,
            ruleIds: [facetRule.id],
          },
          {
            traceId: observation.trace_id,
            spanStartTimeISO: "2026-11-02T08:01:00.000Z",
            ruleIds: [],
          },
        ]);
      } else {
        expect(mocks.record).not.toHaveBeenCalled();
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
    await Promise.all(
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

    await firstBatch.flushTraceActivity();
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith(projectId, [
      {
        traceId: "trace-0",
        spanStartTimeISO: startTimeISO,
        ruleIds: [facetRule.id],
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
      },
    ]);
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
        for (const span_id of ["root", "child"]) {
          await scheduleEvals({
            observation: { ...observation, span_id },
            traceActivity: createTraceActivity(observation.trace_id),
            rules,
            schedulerDeps,
          });
        }
        await schedulerDeps.flushTraceActivity();
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
