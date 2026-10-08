import { describe, expect, it, vi } from "vitest";
import {
  EvalTargetObject,
  EvalTemplateType,
  JobConfigState,
  JobExecutionStatus,
  type ObservationForEval,
} from "@langfuse/shared";
import type { Prisma } from "@langfuse/shared/src/db";
import { scheduleScoreResultEvals } from "../scheduleScoreResultEvals";
import type {
  ObservationEvalSchedulerDeps,
  ScoreResultEvalRule,
} from "../types";

const observation = {
  span_id: "observation-1",
  trace_id: "trace-1",
  project_id: "project-1",
} as ObservationForEval;

const rule = {
  id: "rule-1",
  ruleId: "rule-1",
  projectId: "project-1",
  filter: [],
  sampling: { toNumber: () => 1 } as Prisma.Decimal,
  targetObject: EvalTargetObject.EVENT,
  status: JobConfigState.ACTIVE,
  scoreResultTrigger: {
    evaluatorId: "source-evaluator",
    predicates: [
      {
        scoreName: "toxicity",
        dataType: "BOOLEAN",
        operator: "=",
        value: false,
      },
    ],
  },
  assignments: [
    {
      id: "assignment-1",
      evaluatorId: "downstream-evaluator",
      variableMapping: null,
      evaluator: {
        id: "downstream-evaluator",
        projectId: "project-1",
        type: EvalTemplateType.CODE,
      },
    },
  ],
} satisfies ScoreResultEvalRule;

function createSchedulerDeps(): ObservationEvalSchedulerDeps {
  return {
    upsertJobExecution: vi.fn().mockResolvedValue({
      id: "job-1",
      status: JobExecutionStatus.PENDING,
    }),
    uploadObservationToS3: vi.fn().mockResolvedValue("observation.json"),
    enqueueEvalJob: vi.fn().mockResolvedValue(undefined),
  };
}

describe("scheduleScoreResultEvals", () => {
  it("schedules only rules matching scores from this execution", async () => {
    const schedulerDeps = createSchedulerDeps();

    await scheduleScoreResultEvals({
      observation,
      scores: [{ name: "toxicity", dataType: "BOOLEAN", value: 0 }],
      rules: [rule],
      upstreamJobExecutionId: "upstream-job-1",
      schedulerDeps,
    });

    expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalledOnce();
    expect(schedulerDeps.upsertJobExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        jobConfigurationId: "rule-1",
      }),
    );
  });

  it("does not schedule when a returned score is missing", async () => {
    const schedulerDeps = createSchedulerDeps();

    await scheduleScoreResultEvals({
      observation,
      scores: [],
      rules: [rule],
      upstreamJobExecutionId: "upstream-job-1",
      schedulerDeps,
    });

    expect(schedulerDeps.enqueueEvalJob).not.toHaveBeenCalled();
  });

  it("uses the upstream execution as the downstream idempotency scope", async () => {
    const firstDeps = createSchedulerDeps();
    const secondDeps = createSchedulerDeps();
    const params = {
      observation,
      scores: [{ name: "toxicity", dataType: "BOOLEAN", value: 0 }],
      rules: [rule],
    };

    await scheduleScoreResultEvals({
      ...params,
      upstreamJobExecutionId: "upstream-job-1",
      schedulerDeps: firstDeps,
    });
    await scheduleScoreResultEvals({
      ...params,
      upstreamJobExecutionId: "upstream-job-2",
      schedulerDeps: secondDeps,
    });

    expect(firstDeps.upsertJobExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
      }),
    );
    expect(secondDeps.upsertJobExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.not.stringMatching(
          firstDeps.upsertJobExecution.mock.calls[0]![0].id,
        ),
      }),
    );
  });

  it("does not enqueue an execution that already completed", async () => {
    const schedulerDeps = createSchedulerDeps();
    vi.mocked(schedulerDeps.upsertJobExecution).mockResolvedValue({
      id: "job-1",
      status: JobExecutionStatus.COMPLETED,
    });

    await scheduleScoreResultEvals({
      observation,
      scores: [{ name: "toxicity", dataType: "BOOLEAN", value: 0 }],
      rules: [rule],
      upstreamJobExecutionId: "upstream-job-1",
      schedulerDeps,
    });

    expect(schedulerDeps.enqueueEvalJob).not.toHaveBeenCalled();
  });
});
