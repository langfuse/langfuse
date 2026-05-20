import { randomUUID } from "node:crypto";
import {
  eventTypes,
  createW3CTraceId,
  extractObservationVariables,
  getEventsStreamForEval,
  processEventBatch,
  resolveConfiguredCodeEvalDispatcher,
  runCodeBasedEvaluationDispatch,
  type DispatchResult,
  type InternalTraceWriteInput,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

import {
  assertCodeBasedEvalTemplate,
  observationForEvalSchema,
  type EvalTargetObject,
  type EvalTemplateCodeBased,
  type ObservationForEval,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";

export type CodeEvalTestRunResult =
  | {
      success: true;
      result: DispatchResult;
      executionTraceId: string;
    }
  | {
      success: false;
      error: {
        code: string;
        message: string;
      };
      executionTraceId: string;
    };

export async function runCodeEvalTest(params: {
  prisma: PrismaClient;
  projectId: string;
  evalTemplateId: string;
  target: EvalTargetObject;
  mapping: ObservationVariableMapping[];
  scoreName: string;
  observationId: string;
}): Promise<CodeEvalTestRunResult> {
  const dispatcher = resolveConfiguredCodeEvalDispatcher();

  if (!dispatcher) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Code eval dispatcher is not configured",
    });
  }

  const [project, template] = await Promise.all([
    params.prisma.project.findUnique({
      where: { id: params.projectId },
      select: { orgId: true },
    }),
    params.prisma.evalTemplate.findFirst({
      where: {
        id: params.evalTemplateId,
        OR: [{ projectId: params.projectId }, { projectId: null }],
      },
    }),
  ]);

  if (!project) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found",
    });
  }

  if (!template) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Evaluator template not found",
    });
  }

  let codeTemplate: EvalTemplateCodeBased;
  try {
    assertCodeBasedEvalTemplate(template);
    codeTemplate = template;
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error instanceof Error
          ? error.message
          : "Evaluator template is not a code-based template",
    });
  }

  const observation = await getObservationForEvalById({
    projectId: params.projectId,
    id: params.observationId,
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
    organizationId: project.orgId,
    projectId: params.projectId,
    executionTraceId,
    jobExecutionId: executionTraceId,
    template: codeTemplate,
    scoreName: params.scoreName,
    extractedVariables,
    traceName,
    metadata: executionMetadata,
    maskErrorsInTrace: true,
    writeTrace: writeTraceViaIngestion,
  });

  if (dispatchOutcome.success) {
    return {
      success: true,
      result: dispatchOutcome.result,
      executionTraceId: dispatchOutcome.executionTraceId,
    };
  }

  return {
    success: false,
    error: dispatchOutcome.error,
    executionTraceId: dispatchOutcome.executionTraceId,
  };
}

async function getObservationForEvalById(params: {
  projectId: string;
  id: string;
}): Promise<ObservationForEval> {
  const stream = await getEventsStreamForEval({
    projectId: params.projectId,
    filter: [
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
      environment: rootEventInput.environment,
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
      environment: eventInput.environment,
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
