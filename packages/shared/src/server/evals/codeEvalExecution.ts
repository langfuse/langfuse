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
  CODE_EVAL_DISPATCH_PAYLOAD_MAX_BYTES,
  CODE_EVAL_DISPATCH_RESULT_MAX_BYTES,
  CODE_EVAL_SOURCE_MAX_BYTES,
  CodeEvalDispatcherError,
  CodeEvalDispatcherErrorCodes,
  type CodeEvalDispatcherErrorCode,
  type CodeEvalDispatcher,
  type CodeEvalPayload,
  type CodeEvalScoreWithName,
  type DispatchResult,
} from "./codeEvalDispatcherTypes";
import type { ExtractedVariable } from "./extractObservationVariables";

const INTERNAL_CODE_EVAL_ERROR_MESSAGE = "An internal error occurred";
const INTERNAL_CODE_EVAL_ERROR_CODE = "INTERNAL_ERROR" as const;
// TODO: Replace with a dedicated code-based evaluator limits docs page.
const CODE_EVAL_DOCS_URL = "https://langfuse.com/docs/evaluation/overview";

const INTERNAL_CODE_EVAL_ERROR_CODES = new Set<CodeEvalDispatcherErrorCode>([
  CodeEvalDispatcherErrorCodes.LAMBDA_CONCURRENCY_LIMIT,
  CodeEvalDispatcherErrorCodes.LAMBDA_CONFIGURATION_ERROR,
  CodeEvalDispatcherErrorCodes.LAMBDA_INVOCATION_ERROR,
]);

const USER_VISIBLE_CODE_EVAL_ERROR_MESSAGE_BY_CODE: Partial<
  Record<CodeEvalDispatcherErrorCode, string>
> = {
  [CodeEvalDispatcherErrorCodes.INVALID_RESULT]: withCodeEvalDocs(
    "The evaluator returned an invalid result. Return { scores: [...] } with at least one score. Each score requires a name, dataType, and value; dataType must match the value type.",
  ),
  [CodeEvalDispatcherErrorCodes.TIMEOUT]: withCodeEvalDocs(
    "Evaluator timed out. Code-based evaluators are limited by the configured runtime limit. Optimize your evaluator code and try again.",
  ),
  [CodeEvalDispatcherErrorCodes.SOURCE_TOO_LARGE]: withCodeEvalDocs(
    `Evaluator source code is too large. Code-based evaluator source code is limited to ${formatCodeEvalByteLimit(CODE_EVAL_SOURCE_MAX_BYTES)}. Shorten the evaluator code and try again.`,
  ),
  [CodeEvalDispatcherErrorCodes.PAYLOAD_TOO_LARGE]: withCodeEvalDocs(
    `Evaluator input is too large. Code-based evaluator input is limited to ${formatCodeEvalByteLimit(CODE_EVAL_DISPATCH_PAYLOAD_MAX_BYTES)}, including source code and variables. Reduce the selected input, output, metadata, or experiment fields and try again.`,
  ),
  [CodeEvalDispatcherErrorCodes.RESULT_TOO_LARGE]: withCodeEvalDocs(
    `Evaluator result is too large. Code-based evaluator results are limited to ${formatCodeEvalByteLimit(CODE_EVAL_DISPATCH_RESULT_MAX_BYTES)}. Return fewer scores or smaller score values, comments, and metadata.`,
  ),
};

function withCodeEvalDocs(message: string): string {
  return `${message} See ${CODE_EVAL_DOCS_URL} for details.`;
}

function formatCodeEvalByteLimit(bytes: number): string {
  const unit = bytes >= 1024 * 1024 ? "MB" : "KB";
  const value = bytes / (unit === "MB" ? 1024 * 1024 : 1024);
  const formattedValue = Number.isInteger(value)
    ? String(value)
    : value.toFixed(1);

  return `${formattedValue} ${unit}`;
}

export type CodeEvalUserVisibleErrorCode =
  | CodeEvalDispatcherErrorCode
  | typeof INTERNAL_CODE_EVAL_ERROR_CODE;

export type CodeEvalUserVisibleError = {
  code: CodeEvalUserVisibleErrorCode;
  message: string;
  retryable: boolean;
};

type CodeBasedEvaluationDispatchResult =
  | {
      success: true;
      scores: CodeEvalScoreWithName[];
      result: DispatchResult;
      executionTraceId: string;
      executionTraceFromTimestamp: Date;
    }
  | {
      success: false;
      error: CodeEvalUserVisibleError;
      executionTraceId: string;
      executionTraceFromTimestamp: Date;
    };

function buildCodeEvalPayload(params: {
  extractedVariables: ExtractedVariable[];
  hasExperimentContext: boolean;
}): CodeEvalPayload {
  const byName = new Map(
    params.extractedVariables.map((v) => [v.var, v.value]),
  );
  const payload: CodeEvalPayload = {
    observation: {
      input: byName.get("input") ?? null,
      output: byName.get("output") ?? null,
      metadata: byName.get("metadata") ?? null,
    },
  };

  if (params.hasExperimentContext) {
    payload.experiment = {
      itemExpectedOutput: byName.get("experimentExpectedOutput") ?? null,
      itemMetadata: byName.get("experimentItemMetadata") ?? null,
    };
  }

  return payload;
}

function getCodeEvalErrorDetails(error: unknown): {
  name: string;
  message: string;
  code: CodeEvalUserVisibleErrorCode;
  retryable: boolean;
} {
  if (error instanceof CodeEvalDispatcherError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      retryable: error.retryable,
    };
  }

  return {
    name: error instanceof Error ? error.name : "Error",
    code: INTERNAL_CODE_EVAL_ERROR_CODE,
    message: INTERNAL_CODE_EVAL_ERROR_MESSAGE,
    retryable: false,
  };
}

export function getCodeEvalUserVisibleError(
  error: unknown,
): CodeEvalUserVisibleError {
  const details = getCodeEvalErrorDetails(error);

  if (details.code === INTERNAL_CODE_EVAL_ERROR_CODE) {
    return {
      code: INTERNAL_CODE_EVAL_ERROR_CODE,
      message: INTERNAL_CODE_EVAL_ERROR_MESSAGE,
      retryable: details.retryable,
    };
  }

  if (INTERNAL_CODE_EVAL_ERROR_CODES.has(details.code)) {
    return {
      code: INTERNAL_CODE_EVAL_ERROR_CODE,
      message: INTERNAL_CODE_EVAL_ERROR_MESSAGE,
      retryable: details.retryable,
    };
  }

  const message = USER_VISIBLE_CODE_EVAL_ERROR_MESSAGE_BY_CODE[details.code];
  return {
    code: details.code,
    message: message ?? details.message,
    retryable: details.retryable,
  };
}

export async function runCodeBasedEvaluationDispatch(params: {
  dispatcher: CodeEvalDispatcher;
  organizationId: string;
  projectId: string;
  executionTraceId: string;
  jobExecutionId: string;
  template: EvalTemplateCodeBased;
  extractedVariables: ExtractedVariable[];
  hasExperimentContext?: boolean;
  traceName: string;
  metadata: Record<string, unknown>;
  writeTrace?: InternalTraceWriter;
}): Promise<CodeBasedEvaluationDispatchResult> {
  const payload = buildCodeEvalPayload({
    extractedVariables: params.extractedVariables,
    hasExperimentContext: params.hasExperimentContext ?? false,
  });
  const traceStartTime = new Date();
  let dispatchResult: DispatchResult | undefined;

  try {
    dispatchResult = await params.dispatcher.dispatch({
      scope: {
        organizationId: params.organizationId,
        projectId: params.projectId,
        evaluatorId: params.template.id,
      },
      runtime: { language: params.template.sourceCodeLanguage },
      execution: { jobExecutionId: params.jobExecutionId },
      code: { source: params.template.sourceCode },
      payload,
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
      scores: dispatchResult.scores,
      result: dispatchResult,
      executionTraceId: params.executionTraceId,
      executionTraceFromTimestamp: traceStartTime,
    };
  } catch (error) {
    const errorDetails = getCodeEvalErrorDetails(error);
    const visibleError = getCodeEvalUserVisibleError(error);
    const traceError = {
      name: errorDetails.name,
      code: visibleError.code,
      message: visibleError.message,
      retryable: errorDetails.retryable,
    };
    const errorCodeForTrace = errorDetails.code;

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
          error_name: errorDetails.name,
          error_message: visibleError.message,
          error_code: errorCodeForTrace,
          ...(errorCodeForTrace !== visibleError.code
            ? { error_public_code: visibleError.code }
            : {}),
          error_retryable: errorDetails.retryable,
        },
        sourceCode: params.template.sourceCode,
        level: "ERROR",
        statusMessage: `Code eval execution failed: ${visibleError.message}`,
      }),
    });

    return {
      success: false,
      error: visibleError,
      executionTraceId: params.executionTraceId,
      executionTraceFromTimestamp: traceStartTime,
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
