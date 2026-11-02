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
  topicsEnabled: vi.fn(),
  topicsActive: vi.fn(),
  createObservationDeps: vi.fn(),
  record: vi.fn(),
}));

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
    mocks.topicsEnabled.mockReturnValue(true);
    mocks.topicsActive.mockResolvedValue(true);
    mocks.record.mockResolvedValue(undefined);
  });

  it.each([true, false])(
    "preserves observation scheduling with Topics enabled=%s",
    async (enabled) => {
      mocks.topicsEnabled.mockReturnValue(enabled);
      const observationDeps = createMockSchedulerDeps();
      mocks.createObservationDeps.mockReturnValue(observationDeps);
      const rules: EvalRules = {
        observationRules: [createTestEvalConfig()],
        traceTranscriptRules: [facetRule],
      };
      const schedulerDeps = createEvalSchedulerDeps(projectId, rules);
      const observation = createTestObservation({ name: "selected" });
      await scheduleEvals({ observation, startTimeISO, rules, schedulerDeps });
      await scheduleEvals({
        observation: { ...observation, span_id: "child", name: "unmatched" },
        startTimeISO: "2026-11-02T08:01:00.000Z",
        rules,
        schedulerDeps,
      });
      await schedulerDeps.flushTraceActivity();

      expect(observationDeps.enqueueEvalJob).toHaveBeenCalledTimes(2);
      if (enabled) {
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

  it("retains trace recording when observation scheduling fails", async () => {
    const observationDeps = createMockSchedulerDeps();
    observationDeps.uploadObservationToS3.mockRejectedValueOnce(
      new Error("S3 unavailable"),
    );
    mocks.createObservationDeps.mockReturnValue(observationDeps);
    const rules: EvalRules = {
      observationRules: [createTestEvalConfig()],
      traceTranscriptRules: [facetRule],
    };
    const schedulerDeps = createEvalSchedulerDeps(projectId, rules);
    const observation = createTestObservation({ name: "selected" });

    await expect(
      scheduleEvals({ observation, startTimeISO, rules, schedulerDeps }),
    ).rejects.toThrow("Failed to schedule evaluations");
    await schedulerDeps.flushTraceActivity();
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith(projectId, [
      {
        traceId: observation.trace_id,
        spanStartTimeISO: startTimeISO,
        ruleIds: [facetRule.id],
      },
    ]);
  });

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
          startTimeISO,
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
            startTimeISO,
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
