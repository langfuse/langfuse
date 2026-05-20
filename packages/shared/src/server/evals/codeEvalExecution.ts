import { stringifyValue } from "../../utils/stringChecks";
import {
  INTERNAL_TRACE_EVENT_SOURCE,
  type InternalTraceEventInput,
} from "../llm/internalTraceEvents";
import {
  LangfuseInternalTraceEnvironment,
  type InternalTraceWriteInput,
  type InternalTraceWriter,
} from "../llm/types";
import { logger } from "../logger";
import type { EvalTemplateCodeBased } from "../../features/evals/types";
import {
  CodeEvalDispatcherError,
  CodeEvalDispatcherErrorCode,
  type CodeEvalDispatcher,
  type CodeEvalPayload,
  type CodeEvalScore,
  type CodeEvalScoreWithName,
  type DispatchResult,
} from "./codeEvalDispatcherTypes";
import type { ExtractedVariable } from "./extractObservationVariables";

const CODE_EVAL_SCOPE_ENVIRONMENT = "code-based-eval";
const INTERNAL_CODE_EVAL_ERROR_MESSAGE = "An internal error occurred";

const INTERNAL_CODE_EVAL_ERROR_CODES = new Set<CodeEvalDispatcherErrorCode>([
  "LAMBDA_CONCURRENCY_LIMIT",
  "LAMBDA_CONFIGURATION_ERROR",
  "LAMBDA_INVOCATION_ERROR",
]);

type CodeBasedEvaluationDispatchResult =
  | {
      success: true;
      scores: CodeEvalScoreWithName[];
      result: DispatchResult;
      executionTraceId: string;
    }
  | {
      success: false;
      error: {
        code: string;
        message: string;
      };
      cause: unknown;
      executionTraceId: string;
    };

function buildCodeEvalPayload(
  extractedVariables: ExtractedVariable[],
): CodeEvalPayload {
  const byName = new Map(extractedVariables.map((v) => [v.var, v.value]));
  const hasExperiment = byName.has("experimentExpectedOutput");

  const payload: CodeEvalPayload = {
    observation: {
      input: byName.get("input") ?? null,
      output: byName.get("output") ?? null,
      metadata: byName.get("observationMetadata") ?? null,
    },
  };

  if (hasExperiment) {
    payload.experiment = {
      expectedOutput: byName.get("experimentExpectedOutput") ?? null,
      itemMetadata: null,
    };
  }

  return payload;
}

function normalizeCodeEvalScores(params: {
  scores: CodeEvalScore[];
  defaultScoreName: string;
}): CodeEvalScoreWithName[] {
  return params.scores.map((score) =>
    score.name
      ? (score as CodeEvalScoreWithName)
      : { ...score, name: params.defaultScoreName },
  );
}

function serializeCodeEvalError(error: unknown): {
  name: string;
  message: string;
  code?: string;
  retryable?: boolean;
} {
  const base =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "Error", message: String(error) };

  if (!error || typeof error !== "object") return base;

  const errorRecord = error as Record<string, unknown>;

  return {
    ...base,
    ...(typeof errorRecord.code === "string" ? { code: errorRecord.code } : {}),
    ...(typeof errorRecord.retryable === "boolean"
      ? { retryable: errorRecord.retryable }
      : {}),
  };
}

export function getCodeEvalUserVisibleError(error: unknown): {
  code: string;
  message: string;
} {
  const details = serializeCodeEvalError(error);

  if (isCodeEvalDispatcherErrorLike(error)) {
    return INTERNAL_CODE_EVAL_ERROR_CODES.has(error.code)
      ? { code: "INTERNAL_ERROR", message: INTERNAL_CODE_EVAL_ERROR_MESSAGE }
      : { code: error.code, message: error.message };
  }

  return {
    code: details.code ?? "INTERNAL_ERROR",
    message: INTERNAL_CODE_EVAL_ERROR_MESSAGE,
  };
}

function isCodeEvalDispatcherErrorLike(
  error: unknown,
): error is Pick<CodeEvalDispatcherError, "code" | "message" | "retryable"> {
  if (error instanceof CodeEvalDispatcherError) return true;
  if (!error || typeof error !== "object") return false;

  const record = error as Record<string, unknown>;
  return (
    record.name === "CodeEvalDispatcherError" &&
    typeof record.code === "string" &&
    CodeEvalDispatcherErrorCode.safeParse(record.code).success &&
    typeof record.message === "string"
  );
}

export async function runCodeBasedEvaluationDispatch(params: {
  dispatcher: CodeEvalDispatcher;
  organizationId: string;
  projectId: string;
  executionTraceId: string;
  jobExecutionId: string;
  template: EvalTemplateCodeBased;
  scoreName: string;
  extractedVariables: ExtractedVariable[];
  traceName: string;
  metadata: Record<string, unknown>;
  writeTrace?: InternalTraceWriter;
  maskErrorsInTrace?: boolean;
}): Promise<CodeBasedEvaluationDispatchResult> {
  const payload = buildCodeEvalPayload(params.extractedVariables);
  const traceStartTime = new Date();
  let dispatchResult: DispatchResult | undefined;

  try {
    dispatchResult = await params.dispatcher.dispatch({
      scope: {
        organizationId: params.organizationId,
        projectId: params.projectId,
        evaluatorId: params.template.id,
        environment: CODE_EVAL_SCOPE_ENVIRONMENT,
      },
      runtime: { language: params.template.sourceCodeLanguage },
      execution: { jobExecutionId: params.jobExecutionId },
      code: { source: params.template.sourceCode },
      payload,
    });

    const scores = normalizeCodeEvalScores({
      scores: dispatchResult.scores,
      defaultScoreName: params.scoreName,
    });

    await writeCodeEvalTraceSafely({
      writeTrace: params.writeTrace,
      trace: buildCodeEvalTraceInput({
        projectId: params.projectId,
        executionTraceId: params.executionTraceId,
        traceStartTime,
        traceName: params.traceName,
        payload,
        output: dispatchResult,
        metadata: params.metadata,
        sourceCode: params.template.sourceCode,
      }),
    });

    return {
      success: true,
      scores,
      result: dispatchResult,
      executionTraceId: params.executionTraceId,
    };
  } catch (error) {
    const serializedError = serializeCodeEvalError(error);
    const visibleError = getCodeEvalUserVisibleError(error);
    const traceError = params.maskErrorsInTrace
      ? {
          ...serializedError,
          code: visibleError.code,
          message: visibleError.message,
        }
      : serializedError;

    await writeCodeEvalTraceSafely({
      writeTrace: params.writeTrace,
      trace: buildCodeEvalTraceInput({
        projectId: params.projectId,
        executionTraceId: params.executionTraceId,
        traceStartTime,
        traceName: params.traceName,
        payload,
        output: {
          ...(dispatchResult ? { result: dispatchResult } : {}),
          error: traceError,
        },
        metadata: {
          ...params.metadata,
          error_name: serializedError.name,
          error_message: params.maskErrorsInTrace
            ? visibleError.message
            : serializedError.message,
          error_code: params.maskErrorsInTrace
            ? visibleError.code
            : (serializedError.code ?? visibleError.code),
          ...(typeof serializedError.retryable === "boolean"
            ? { error_retryable: serializedError.retryable }
            : {}),
        },
        sourceCode: params.template.sourceCode,
        level: "ERROR",
        statusMessage: `Code eval execution failed: ${
          params.maskErrorsInTrace
            ? visibleError.message
            : serializedError.message
        }`,
      }),
    });

    return {
      success: false,
      error: visibleError,
      cause: error,
      executionTraceId: params.executionTraceId,
    };
  }
}

function buildCodeEvalTraceInput(params: {
  projectId: string;
  executionTraceId: string;
  traceStartTime: Date;
  traceName: string;
  payload: CodeEvalPayload;
  output: unknown;
  metadata: Record<string, unknown>;
  sourceCode: string;
  level?: string;
  statusMessage?: string;
}): InternalTraceWriteInput {
  const eventInput: InternalTraceEventInput = {
    projectId: params.projectId,
    traceId: params.executionTraceId,
    spanId: params.executionTraceId,
    startTimeISO: params.traceStartTime.toISOString(),
    endTimeISO: new Date().toISOString(),
    name: params.traceName,
    traceName: params.traceName,
    type: "SPAN",
    environment: LangfuseInternalTraceEnvironment.CodeEval,
    level: params.level ?? "DEFAULT",
    statusMessage: params.statusMessage,
    input: stringifyValue(params.payload),
    output: stringifyValue(params.output),
    metadata: {
      ...params.metadata,
      code_eval_source_code: params.sourceCode,
    },
    source: INTERNAL_TRACE_EVENT_SOURCE,
  };

  return {
    rootSpanId: params.executionTraceId,
    eventInputs: [eventInput],
  };
}

async function writeCodeEvalTraceSafely(params: {
  writeTrace?: InternalTraceWriter;
  trace: InternalTraceWriteInput;
}) {
  if (!params.writeTrace) return;

  try {
    await params.writeTrace(params.trace);
  } catch (error) {
    logger.warn("Failed to write internal trace for code eval execution", {
      executionTraceId: params.trace.rootSpanId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
