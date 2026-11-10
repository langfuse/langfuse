import {
  EvalTemplateType,
  JobConfigState,
  TopicsTargetObject,
  extractValueFromObject,
} from "@langfuse/shared";
import { JobExecutionStatus, prisma } from "@langfuse/shared/src/db";
import {
  CodeEvalExecutionQueue,
  LLMAsJudgeExecutionQueue,
  QueueJobs,
  QueueName,
  createW3CTraceId,
  logger,
  type TraceBatchInputReference,
} from "@langfuse/shared/src/server";

export const TRACE_TRANSCRIPT_EVAL_CONSUMER = "trace-transcript-eval";

export const TRACE_TRANSCRIPT_EVAL_TYPES = [
  EvalTemplateType.LLM_AS_JUDGE,
  EvalTemplateType.DECISION_MODEL,
  EvalTemplateType.CODE,
] as const;

type TranscriptEvalVariableMapping = {
  templateVariable: string;
  selectedColumnId: string;
  jsonSelector?: string | null;
};

type TraceTranscriptEvalJob = {
  queueName: QueueName.LLMAsJudgeExecution | QueueName.CodeEvalExecution;
  jobName: QueueJobs.LLMAsJudgeExecution | QueueJobs.CodeEvalExecution;
  jobId: string;
  delay: number;
  shardingKey: string;
  payload: {
    projectId: string;
    jobExecutionId: string;
    traceId: string;
    revision: string;
    transcriptS3Path: string;
    evaluatorId: string;
    evaluationRuleId: string;
  };
};

type TranscriptEvalAssignment = {
  id: string;
  evaluatorId: string;
  evaluationRuleId: string;
  evaluatorType: EvalTemplateType;
  delay: number;
};

/** Same id for the execution row and the BullMQ job, so a retry cannot reset a finished row or enqueue a second job. */
export function traceTranscriptEvalExecutionId(params: {
  projectId: string;
  ruleId: string;
  assignmentId: string;
  traceId: string;
  revision: string;
}): string {
  return createW3CTraceId(
    JSON.stringify([
      "trace-transcript-eval",
      params.projectId,
      params.ruleId,
      params.assignmentId,
      params.traceId,
      params.revision,
    ]),
  );
}

export function isTranscriptEvalJob(event: {
  transcriptS3Path?: string;
  traceId?: string;
  revision?: string;
}): event is { transcriptS3Path: string; traceId: string; revision: string } {
  return Boolean(event.transcriptS3Path && event.traceId && event.revision);
}

/**
 * Reads the threads list through the rule mapping. A transcript job has no
 * observation columns, so a missing threads binding or any other column is
 * terminal.
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

export function buildTraceTranscriptEvalJob(params: {
  projectId: string;
  traceId: string;
  revision: string;
  transcriptS3Path: string;
  ruleId: string;
  assignmentId: string;
  evaluatorId: string;
  evaluatorType: EvalTemplateType;
  delay: number;
}): TraceTranscriptEvalJob {
  const jobExecutionId = traceTranscriptEvalExecutionId({
    projectId: params.projectId,
    ruleId: params.ruleId,
    assignmentId: params.assignmentId,
    traceId: params.traceId,
    revision: params.revision,
  });
  const target = executionTarget(params.evaluatorType);
  return {
    queueName: target.queueName,
    jobName: target.jobName,
    jobId: jobExecutionId,
    delay: params.delay,
    shardingKey: `${params.projectId}-${jobExecutionId}`,
    payload: {
      projectId: params.projectId,
      jobExecutionId,
      traceId: params.traceId,
      revision: params.revision,
      transcriptS3Path: params.transcriptS3Path,
      evaluatorId: params.evaluatorId,
      evaluationRuleId: params.ruleId,
    },
  };
}

/** Inserts one pending execution per runnable assignment, then adds its job. A failed add deletes that pending row. */
export async function enqueueTraceTranscriptEvals(
  reference: TraceBatchInputReference,
  ruleIds: string[],
  context: { traceTimestamp: Date; transcriptS3Path: string },
): Promise<void> {
  const assignments = await loadTranscriptEvalAssignments(
    reference.projectId,
    ruleIds,
  );
  for (const assignment of assignments) {
    const job = buildTraceTranscriptEvalJob({
      projectId: reference.projectId,
      traceId: reference.traceId,
      revision: reference.revision,
      transcriptS3Path: context.transcriptS3Path,
      ruleId: assignment.evaluationRuleId,
      assignmentId: assignment.id,
      evaluatorId: assignment.evaluatorId,
      evaluatorType: assignment.evaluatorType,
      delay: assignment.delay,
    });
    const { count } = await prisma.jobExecution.createMany({
      data: [
        {
          id: job.jobId,
          projectId: reference.projectId,
          jobConfigurationId: assignment.evaluationRuleId,
          jobTemplateId: null,
          status: JobExecutionStatus.PENDING,
          startTime: new Date(),
          jobInputTraceId: reference.traceId,
          jobInputTraceTimestamp: context.traceTimestamp,
          jobInputObservationId: null,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) continue;
    try {
      await addTraceTranscriptEvalJob(job);
    } catch (error) {
      logger.warn(
        `Failed to enqueue trace transcript eval ${job.jobId}, removing the pending execution so a retry can recreate it`,
        error,
      );
      await prisma.jobExecution.deleteMany({
        where: {
          id: job.jobId,
          projectId: reference.projectId,
          status: JobExecutionStatus.PENDING,
        },
      });
      throw error;
    }
  }
}

/** One error row per runnable assignment. An id that already exists is left as it is. */
export async function recordTraceTranscriptEvalErrors(params: {
  projectId: string;
  traceId: string;
  revision: string;
  ruleIds: string[];
  error: string;
  traceTimestamp: Date;
}): Promise<void> {
  const assignments = await loadTranscriptEvalAssignments(
    params.projectId,
    params.ruleIds,
  );
  if (assignments.length === 0) return;
  const now = new Date();
  await prisma.jobExecution.createMany({
    data: assignments.map((assignment) => ({
      id: traceTranscriptEvalExecutionId({
        projectId: params.projectId,
        ruleId: assignment.evaluationRuleId,
        assignmentId: assignment.id,
        traceId: params.traceId,
        revision: params.revision,
      }),
      projectId: params.projectId,
      jobConfigurationId: assignment.evaluationRuleId,
      jobTemplateId: null,
      status: JobExecutionStatus.ERROR,
      startTime: now,
      endTime: now,
      error: params.error,
      jobInputTraceId: params.traceId,
      jobInputTraceTimestamp: params.traceTimestamp,
      jobInputObservationId: null,
    })),
    skipDuplicates: true,
  });
}

function executionTarget(evaluatorType: EvalTemplateType): {
  queueName: QueueName.LLMAsJudgeExecution | QueueName.CodeEvalExecution;
  jobName: QueueJobs.LLMAsJudgeExecution | QueueJobs.CodeEvalExecution;
} {
  if (
    evaluatorType === EvalTemplateType.LLM_AS_JUDGE ||
    evaluatorType === EvalTemplateType.DECISION_MODEL
  ) {
    return {
      queueName: QueueName.LLMAsJudgeExecution,
      jobName: QueueJobs.LLMAsJudgeExecution,
    };
  }
  if (evaluatorType === EvalTemplateType.CODE) {
    return {
      queueName: QueueName.CodeEvalExecution,
      jobName: QueueJobs.CodeEvalExecution,
    };
  }
  throw new Error(
    `Evaluator type ${evaluatorType} cannot run on a trace transcript.`,
  );
}

async function addTraceTranscriptEvalJob(
  job: TraceTranscriptEvalJob,
): Promise<void> {
  const data = {
    id: job.jobId,
    timestamp: new Date(),
    payload: job.payload,
  };
  const options = { jobId: job.jobId, delay: job.delay };
  if (job.queueName === QueueName.CodeEvalExecution) {
    const queue = CodeEvalExecutionQueue.getInstance({
      shardingKey: job.shardingKey,
    });
    if (!queue) throw new Error("CodeEvalExecutionQueue is not initialized");
    await queue.add(
      QueueName.CodeEvalExecution,
      { ...data, name: QueueJobs.CodeEvalExecution },
      options,
    );
    return;
  }
  const queue = LLMAsJudgeExecutionQueue.getInstance({
    shardingKey: job.shardingKey,
  });
  if (!queue) throw new Error("LLMAsJudgeExecutionQueue is not initialized");
  await queue.add(
    QueueName.LLMAsJudgeExecution,
    { ...data, name: QueueJobs.LLMAsJudgeExecution },
    options,
  );
}

async function loadTranscriptEvalAssignments(
  projectId: string,
  ruleIds: string[],
): Promise<TranscriptEvalAssignment[]> {
  const uniqueRuleIds = [...new Set(ruleIds)];
  if (uniqueRuleIds.length === 0) return [];
  const rows = await prisma.evaluationRuleEvaluatorAssignment.findMany({
    where: {
      projectId,
      evaluationRuleId: { in: uniqueRuleIds },
      evaluationRule: {
        projectId,
        status: JobConfigState.ACTIVE,
        targetObject: TopicsTargetObject,
      },
      evaluator: {
        projectId,
        blockedAt: null,
        type: { in: [...TRACE_TRANSCRIPT_EVAL_TYPES] },
      },
    },
    select: {
      id: true,
      evaluatorId: true,
      evaluationRuleId: true,
      evaluator: { select: { type: true } },
      evaluationRule: { select: { delay: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    evaluatorId: row.evaluatorId,
    evaluationRuleId: row.evaluationRuleId,
    evaluatorType: row.evaluator.type,
    delay: row.evaluationRule.delay,
  }));
}
