import { EvalTemplateType, extractValueFromObject } from "@langfuse/shared";
import { prisma, JobExecutionStatus } from "@langfuse/shared/src/db";
import {
  LLMAsJudgeExecutionQueue,
  QueueJobs,
  QueueName,
  createW3CTraceId,
  logger,
  type TraceBatchInputReference,
} from "@langfuse/shared/src/server";

export const TRACE_TRANSCRIPT_EVAL_CONSUMER = "trace-transcript-eval";

/**
 * Judge and decision-model assignments. Code evaluators are not scheduled here.
 */
export const TRACE_TRANSCRIPT_EVAL_TYPES = [
  EvalTemplateType.LLM_AS_JUDGE,
  EvalTemplateType.DECISION_MODEL,
] as const;

type TraceTranscriptEvalAssignment = {
  id: string;
  evaluatorId: string;
  evaluationRule: { id: string; delay: number | null };
};

type TraceTranscriptEvalJob = {
  projectId: string;
  jobExecutionId: string;
  traceId: string;
  revision: string;
  transcriptS3Path: string;
  evaluatorId: string;
  evaluationRuleId: string;
  delay: number;
};

/** Same helper span-level evals use. Revision stands in for the span id. */
function traceTranscriptEvalExecutionId(params: {
  ruleId: string;
  assignmentId: string;
  traceId: string;
  revision: string;
}): string {
  return createW3CTraceId(
    JSON.stringify([
      "trace-transcript-eval",
      params.ruleId,
      params.assignmentId,
      params.traceId,
      params.revision,
    ]),
  );
}

type TranscriptEvalVariableMapping = {
  templateVariable: string;
  selectedColumnId: string;
  jsonSelector?: string | null;
};

/**
 * Judge and decision-model jobs read the transcript through a threads binding.
 * A mapping that is empty or names any other column is not executable.
 */
export function extractTranscriptEvalVariables(
  threads: unknown,
  variableMapping: readonly TranscriptEvalVariableMapping[],
):
  | { ok: true; variables: { var: string; value: unknown }[] }
  | { ok: false; error: string } {
  if (variableMapping.length === 0) {
    return {
      ok: false,
      error: "Transcript evaluation requires a threads variable.",
    };
  }
  if (
    variableMapping.some((mapping) => mapping.selectedColumnId !== "threads")
  ) {
    return {
      ok: false,
      error: "Transcript evaluation only reads the threads column.",
    };
  }
  return {
    ok: true,
    variables: variableMapping.map((mapping) => ({
      var: mapping.templateVariable,
      value: extractValueFromObject(
        { threads },
        "threads",
        mapping.jsonSelector ?? undefined,
      ).value,
    })),
  };
}

function buildTraceTranscriptEvalJob(params: {
  reference: TraceBatchInputReference;
  transcriptS3Path: string;
  assignment: TraceTranscriptEvalAssignment;
}): TraceTranscriptEvalJob {
  const { reference, assignment } = params;
  return {
    projectId: reference.projectId,
    jobExecutionId: traceTranscriptEvalExecutionId({
      ruleId: assignment.evaluationRule.id,
      assignmentId: assignment.id,
      traceId: reference.traceId,
      revision: reference.revision,
    }),
    traceId: reference.traceId,
    revision: reference.revision,
    transcriptS3Path: params.transcriptS3Path,
    evaluatorId: assignment.evaluatorId,
    evaluationRuleId: assignment.evaluationRule.id,
    delay: assignment.evaluationRule.delay ?? 0,
  };
}

/**
 * Writes one pending execution per assignment, then adds its queue job.
 * A failed add leaves that row pending, the same way a failed span-eval
 * enqueue leaves the row its upsert just wrote. Every assignment is
 * attempted; any failure is thrown afterwards so dispatch can retry.
 */
export async function enqueueTraceTranscriptEvals(
  reference: TraceBatchInputReference,
  ruleIds: string[],
  context: { transcriptS3Path: string },
): Promise<void> {
  const assignments = await loadTranscriptEvalAssignments(
    reference.projectId,
    ruleIds,
  );
  if (assignments.length === 0) return;

  const attempts = await Promise.allSettled(
    assignments.map(async (assignment) => {
      const job = buildTraceTranscriptEvalJob({
        reference,
        transcriptS3Path: context.transcriptS3Path,
        assignment,
      });
      await prisma.jobExecution.upsert({
        where: {
          id: job.jobExecutionId,
          projectId: job.projectId,
        },
        create: {
          id: job.jobExecutionId,
          projectId: job.projectId,
          jobConfigurationId: job.evaluationRuleId,
          jobInputTraceId: job.traceId,
          jobInputObservationId: null,
          jobTemplateId: null,
          status: JobExecutionStatus.PENDING,
          startTime: new Date(),
        },
        update: {
          status: JobExecutionStatus.PENDING,
        },
      });
      await addTraceTranscriptEvalJob(job);
    }),
  );

  const failed = attempts.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (failed.length === 0) return;

  logger.error(
    `${TRACE_TRANSCRIPT_EVAL_CONSUMER}: Failed to schedule assignments`,
    {
      projectId: reference.projectId,
      traceId: reference.traceId,
      revision: reference.revision,
      failedCount: failed.length,
      assignmentCount: attempts.length,
      error: failed[0],
    },
  );
  const firstFailure = failed[0];
  const firstFailureMessage =
    firstFailure instanceof Error
      ? firstFailure.message
      : "Unknown scheduling error";
  throw new AggregateError(
    failed,
    `Failed to schedule ${failed.length} of ${attempts.length} trace transcript eval assignment(s): ${firstFailureMessage}`,
  );
}

async function addTraceTranscriptEvalJob(
  job: TraceTranscriptEvalJob,
): Promise<void> {
  const shardingKey = `${job.projectId}-${job.jobExecutionId}`;
  const queue = LLMAsJudgeExecutionQueue.getInstance({ shardingKey });
  if (!queue) {
    throw new Error("LLMAsJudgeExecutionQueue is not initialized");
  }
  await queue.add(
    QueueName.LLMAsJudgeExecution,
    {
      timestamp: new Date(),
      id: job.jobExecutionId,
      name: QueueJobs.LLMAsJudgeExecution,
      payload: {
        type: "trace-transcript",
        projectId: job.projectId,
        jobExecutionId: job.jobExecutionId,
        traceId: job.traceId,
        revision: job.revision,
        transcriptS3Path: job.transcriptS3Path,
        evaluatorId: job.evaluatorId,
        evaluationRuleId: job.evaluationRuleId,
      },
    },
    {
      delay: job.delay,
      jobId: job.jobExecutionId,
    },
  );
}

async function loadTranscriptEvalAssignments(
  projectId: string,
  ruleIds: string[],
): Promise<TraceTranscriptEvalAssignment[]> {
  return prisma.evaluationRuleEvaluatorAssignment.findMany({
    where: {
      projectId,
      evaluationRuleId: { in: ruleIds },
      evaluator: {
        projectId,
        blockedAt: null,
        type: { in: [...TRACE_TRANSCRIPT_EVAL_TYPES] },
      },
    },
    select: {
      id: true,
      evaluatorId: true,
      evaluationRule: {
        select: { id: true, delay: true },
      },
    },
  });
}
