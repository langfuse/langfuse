import { randomUUID } from "node:crypto";
import {
  eventTypes,
  createW3CTraceId,
  extractObservationVariables,
  getEventsStreamForEval,
  processEventBatch,
  resolveConfiguredCodeEvalDispatcher,
  runCodeBasedEvaluationDispatch,
  type CodeEvalUserVisibleErrorCode,
  type DispatchResult,
  type InternalTraceWriteInput,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

import {
  LangfuseInternalTraceEnvironment,
  observationForEvalSchema,
  type EvalTargetObject,
  type EvalTemplateCodeBased,
  type ObservationForEval,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { EvalTemplateType, type PrismaClient } from "@langfuse/shared/src/db";

export type CodeEvalTestRunResult =
  | {
      success: true;
      result: DispatchResult;
      executionTraceId: string;
      executionTraceFromTimestamp: Date;
    }
  | {
      success: false;
      error: {
        code: CodeEvalUserVisibleErrorCode;
        message: string;
      };
      executionTraceId: string;
      executionTraceFromTimestamp: Date;
    };

export async function runCodeEvalTest(params: {
  prisma: PrismaClient;
  orgId: string;
  projectId: string;
  evalTemplateId: string;
  target: EvalTargetObject;
  mapping: ObservationVariableMapping[];
  scoreName: string;
  observationId: string;
  traceId: string;
  startTime: Date;
}): Promise<CodeEvalTestRunResult> {
  const dispatcher = resolveConfiguredCodeEvalDispatcher();

  if (!dispatcher) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Code eval dispatcher is not configured",
    });
  }

  const codeTemplate = (await params.prisma.evalTemplate.findFirst({
    where: {
      id: params.evalTemplateId,
      type: EvalTemplateType.CODE,
      sourceCode: { not: null },
      sourceCodeLanguage: { not: null },
      OR: [{ projectId: params.projectId }, { projectId: null }],
    },
  })) as EvalTemplateCodeBased | null;

  if (!codeTemplate) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Evaluator template not found",
    });
  }

  const observation = await getObservationForEvalById({
    projectId: params.projectId,
    id: params.observationId,
    traceId: params.traceId,
    startTime: params.startTime,
  });
  const extractedVariables = extractObservationVariables({
    observation,
    variableMapping: params.mapping,
  });
  const executionTraceId = createW3CTraceId();
  const traceName = `Test evaluator: ${codeTemplate.name}`;
  const executionMetadata = {
    dispatcher_name: dispatcher.name,
    code_eval_runtime: codeTemplate.sourceCodeLanguage,
    eval_template_id: codeTemplate.id,
    eval_template_version: codeTemplate.version,
    score_name: params.scoreName,
    target_object: params.target,
    target_trace_id: observation.trace_id,
    target_observation_id: observation.span_id,
  };

  const dispatchOutcome = await runCodeBasedEvaluationDispatch({
    dispatcher,
    organizationId: params.orgId,
    projectId: params.projectId,
    executionTraceId,
    jobExecutionId: executionTraceId,
    template: codeTemplate,
    extractedVariables,
    hasExperimentContext: Boolean(observation.experiment_id),
    traceName,
    metadata: executionMetadata,
    writeTrace: writeTraceViaIngestion,
  });

  if (dispatchOutcome.success) {
    return {
      success: true,
      result: dispatchOutcome.result,
      executionTraceId: dispatchOutcome.executionTraceId,
      executionTraceFromTimestamp: dispatchOutcome.executionTraceFromTimestamp,
    };
  }

  return {
    success: false,
    error: {
      code: dispatchOutcome.error.code,
      message: dispatchOutcome.error.message,
    },
    executionTraceId: dispatchOutcome.executionTraceId,
    executionTraceFromTimestamp: dispatchOutcome.executionTraceFromTimestamp,
  };
}

async function getObservationForEvalById(params: {
  projectId: string;
  id: string;
  traceId: string;
  startTime: Date;
}): Promise<ObservationForEval> {
  const startTimeUpperBound = new Date(params.startTime.getTime() + 1);

  const stream = await getEventsStreamForEval({
    projectId: params.projectId,
    filter: [
      {
        type: "string",
        column: "traceId",
        operator: "=",
        value: params.traceId,
      },
      {
        type: "datetime",
        column: "startTime",
        operator: ">=",
        value: params.startTime,
      },
      {
        type: "datetime",
        column: "startTime",
        operator: "<",
        value: startTimeUpperBound,
      },
      {
        type: "stringOptions",
        column: "id",
        operator: "any of",
        value: [params.id],
      },
    ],
    rowLimit: 1,
  });

  for await (const row of stream) {
    return observationForEvalSchema.parse(row);
  }

  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Observation not found",
  });
}

async function writeTraceViaIngestion(trace: InternalTraceWriteInput) {
  const rootEventInput =
    trace.eventInputs.find(
      (eventInput) => eventInput.spanId === trace.rootSpanId,
    ) ?? trace.eventInputs[0];

  if (!rootEventInput) return;

  const timestamp = new Date().toISOString();
  const traceEvent = {
    id: randomUUID(),
    type: eventTypes.TRACE_CREATE,
    timestamp,
    body: {
      id: rootEventInput.traceId,
      timestamp: rootEventInput.startTimeISO,
      name: rootEventInput.traceName ?? rootEventInput.name,
      environment: getInternalEvalEnvironment(rootEventInput.environment),
      input: rootEventInput.input,
      output: rootEventInput.output,
      metadata: rootEventInput.metadata,
      release: rootEventInput.release,
      version: rootEventInput.version,
      public: rootEventInput.public,
      tags: rootEventInput.tags,
      sessionId: rootEventInput.sessionId,
      userId: rootEventInput.userId,
    },
  };

  const spanEvents = trace.eventInputs.map((eventInput) => ({
    id: randomUUID(),
    type: eventTypes.SPAN_CREATE,
    timestamp,
    body: {
      id: eventInput.spanId,
      traceId: eventInput.traceId,
      name: eventInput.name,
      environment: getInternalEvalEnvironment(eventInput.environment),
      startTime: eventInput.startTimeISO,
      endTime: eventInput.endTimeISO,
      input: eventInput.input,
      output: eventInput.output,
      metadata: eventInput.metadata,
      level: eventInput.level,
      statusMessage: eventInput.statusMessage,
      parentObservationId: eventInput.parentSpanId,
      version: eventInput.version,
    },
  }));

  const result = await processEventBatch(
    [traceEvent, ...spanEvents],
    {
      validKey: true,
      scope: {
        projectId: rootEventInput.projectId,
        accessLevel: "project",
      },
    } satisfies Parameters<typeof processEventBatch>[1],
    { delay: 0, isLangfuseInternal: true },
  );

  if (result.errors.length > 0) {
    throw new Error(result.errors[0]?.error ?? "Failed to write trace");
  }
}

function getInternalEvalEnvironment(environment: string | undefined) {
  return environment === LangfuseInternalTraceEnvironment.CodeEval
    ? LangfuseInternalTraceEnvironment.CodeEval
    : LangfuseInternalTraceEnvironment.LLMJudge;
}
