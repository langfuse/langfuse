import { randomUUID } from "node:crypto";
import {
  DEFAULT_TRACE_ENVIRONMENT,
  eventTypes,
  createW3CTraceId,
  extractObservationVariables,
  getEventsStreamForEval,
  getObservationById,
  processEventBatch,
  resolveConfiguredCodeEvalDispatcher,
  runCodeBasedEvaluationDispatch,
  type CodeEvalUserVisibleError,
  type DispatchResult,
  type InternalTraceWriteInput,
} from "@langfuse/shared/src/server";

import {
  LangfuseNotFoundError,
  LangfuseInternalTraceEnvironment,
  observationForEvalSchema,
  type EvalTargetObject,
  type EvalTemplateCodeBased,
  type FilterCondition,
  type ObservationForEval,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { EvalTemplateType, type PrismaClient } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
import { getExperimentEvalPreviewFilters } from "@/src/features/evals/utils/experiment-eval-preview-utils";
import {
  isEventTarget,
  isExperimentTarget,
} from "@/src/features/evals/utils/typeHelpers";
import { isCodeEvalSourceCodeLanguageSupported } from "@/src/features/evals/server/isCodeEvalEnabled";

type CodeEvalTestRunDispatchError = Omit<CodeEvalUserVisibleError, "retryable">;

type CodeEvalTestRunSetupErrorCode =
  | "DISPATCHER_NOT_CONFIGURED"
  | "TEMPLATE_NOT_FOUND"
  | "UNSUPPORTED_LANGUAGE"
  | "INVALID_TARGET"
  | "OBSERVATION_NOT_FOUND";

export class CodeEvalTestRunSetupError extends Error {
  constructor(
    readonly code: CodeEvalTestRunSetupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CodeEvalTestRunSetupError";
    Object.setPrototypeOf(this, CodeEvalTestRunSetupError.prototype);
  }
}

export type CodeEvalTestRunResult =
  | {
      success: true;
      result: DispatchResult;
      executionTraceId: string;
      executionTraceFromTimestamp: Date;
    }
  | {
      success: false;
      error: CodeEvalTestRunDispatchError;
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
  shouldReadFromObservationsTable?: boolean;
}): Promise<CodeEvalTestRunResult> {
  const observation = await getObservationForEvalById({
    projectId: params.projectId,
    id: params.observationId,
    traceId: params.traceId,
    startTime: params.startTime,
    shouldReadFromObservationsTable: params.shouldReadFromObservationsTable,
  });

  return runCodeEvalTestForObservation({
    ...params,
    observation,
  });
}

export async function runCodeEvalTestForJobConfig(params: {
  prisma: PrismaClient;
  orgId: string;
  projectId: string;
  evalTemplateId: string;
  target: EvalTargetObject;
  mapping: ObservationVariableMapping[];
  scoreName: string;
  filter: FilterCondition[] | null;
}): Promise<CodeEvalTestRunResult | null> {
  const observation = await getObservationForEvalByFilter({
    projectId: params.projectId,
    target: params.target,
    filter: params.filter,
  });

  if (!observation) {
    return null;
  }

  return runCodeEvalTestForObservation({
    ...params,
    observation,
  });
}

async function runCodeEvalTestForObservation(params: {
  prisma: PrismaClient;
  orgId: string;
  projectId: string;
  evalTemplateId: string;
  target: EvalTargetObject;
  mapping: ObservationVariableMapping[];
  scoreName: string;
  observation: ObservationForEval;
}): Promise<CodeEvalTestRunResult> {
  const dispatcher = resolveConfiguredCodeEvalDispatcher();

  if (!dispatcher) {
    throw new CodeEvalTestRunSetupError(
      "DISPATCHER_NOT_CONFIGURED",
      "Code eval dispatcher is not configured",
    );
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
    throw new CodeEvalTestRunSetupError(
      "TEMPLATE_NOT_FOUND",
      "Evaluator template not found",
    );
  }

  if (!isCodeEvalSourceCodeLanguageSupported(codeTemplate.sourceCodeLanguage)) {
    throw new CodeEvalTestRunSetupError(
      "UNSUPPORTED_LANGUAGE",
      "This code evaluator language is not supported by the configured dispatcher.",
    );
  }

  const extractedVariables = extractObservationVariables({
    observation: params.observation,
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
    target_trace_id: params.observation.trace_id,
    target_observation_id: params.observation.span_id,
  };

  const dispatchOutcome = await runCodeBasedEvaluationDispatch({
    dispatcher,
    organizationId: params.orgId,
    projectId: params.projectId,
    executionTraceId,
    jobExecutionId: executionTraceId,
    template: codeTemplate,
    extractedVariables,
    hasExperimentContext: Boolean(params.observation.experiment_id),
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
    error: toCodeEvalTestRunError(dispatchOutcome.error),
    executionTraceId: dispatchOutcome.executionTraceId,
    executionTraceFromTimestamp: dispatchOutcome.executionTraceFromTimestamp,
  };
}

function toCodeEvalTestRunError({
  retryable: _retryable,
  ...error
}: CodeEvalUserVisibleError): CodeEvalTestRunDispatchError {
  return error;
}

async function getObservationForEvalByFilter(params: {
  projectId: string;
  target: EvalTargetObject;
  filter: FilterCondition[] | null;
}): Promise<ObservationForEval | null> {
  if (!isEventTarget(params.target) && !isExperimentTarget(params.target)) {
    throw new CodeEvalTestRunSetupError(
      "INVALID_TARGET",
      "Code evaluators can only run on observations or experiments.",
    );
  }

  const filter = isExperimentTarget(params.target)
    ? getExperimentEvalPreviewFilters(params.filter)
    : params.filter;

  const stream = await getEventsStreamForEval({
    projectId: params.projectId,
    filter,
    rowLimit: 1,
  });

  for await (const row of stream) {
    return observationForEvalSchema.parse(row);
  }

  return null;
}

async function getObservationForEvalById(params: {
  projectId: string;
  id: string;
  traceId: string;
  startTime: Date;
  shouldReadFromObservationsTable?: boolean;
}): Promise<ObservationForEval> {
  if (
    env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN !== "true" ||
    params.shouldReadFromObservationsTable
  ) {
    return getObservationForEvalByIdFromLegacyObservations(params);
  }

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

  throwObservationNotFound();
}

async function getObservationForEvalByIdFromLegacyObservations(params: {
  projectId: string;
  id: string;
  traceId: string;
  startTime: Date;
}): Promise<ObservationForEval> {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const observation = await getObservationById({
    projectId: params.projectId,
    id: params.id,
    traceId: params.traceId,
    startTime: params.startTime,
    fetchWithInputOutput: true,
  }).catch((error) => {
    if (error instanceof LangfuseNotFoundError) {
      throwObservationNotFound();
    }

    throw error;
  });

  if (!observation) {
    throwObservationNotFound();
  }

  return observationForEvalSchema.parse({
    span_id: observation.id,
    trace_id: observation.traceId,
    project_id: params.projectId,
    parent_span_id: observation.parentObservationId,
    type: observation.type,
    name: observation.name ?? "",
    environment: observation.environment ?? DEFAULT_TRACE_ENVIRONMENT,
    version: observation.version,
    level: observation.level,
    status_message: observation.statusMessage,
    trace_name: null,
    user_id: null,
    session_id: null,
    tags: [],
    release: null,
    provided_model_name: observation.model,
    model_parameters: observation.modelParameters,
    prompt_id: observation.promptId,
    prompt_name: observation.promptName,
    prompt_version: observation.promptVersion,
    provided_usage_details: observation.providedUsageDetails ?? {},
    provided_cost_details: observation.providedCostDetails ?? {},
    usage_details: observation.usageDetails ?? {},
    cost_details: observation.costDetails ?? {},
    tool_definitions: observation.toolDefinitions ?? {},
    tool_calls: observation.toolCalls ?? [],
    tool_call_names: observation.toolCallNames ?? [],
    tool_call_count: observation.toolCallNames?.length ?? 0,
    experiment_id: null,
    experiment_name: null,
    experiment_description: null,
    experiment_dataset_id: null,
    experiment_item_id: null,
    experiment_item_expected_output: null,
    experiment_item_metadata: null,
    experiment_item_root_span_id: null,
    input: observation.input,
    output: observation.output,
    metadata: observation.metadata,
  });
}

function throwObservationNotFound(): never {
  throw new CodeEvalTestRunSetupError(
    "OBSERVATION_NOT_FOUND",
    "Observation not found",
  );
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
