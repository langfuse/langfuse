import {
  InvokeCommand,
  LambdaClient,
  type InvokeCommandInput,
} from "@aws-sdk/client-lambda";
import { SpanKind, type AttributeValue, type Span } from "@opentelemetry/api";
import { z } from "zod";
import { instrumentAsync, traceException } from "../instrumentation";
import { logger } from "../logger";
import {
  assertDispatchInputWithinLimits,
  assertDispatchResultWithinByteLimit,
  CodeEvalDispatcherError,
  CodeEvalDispatcherErrorCode,
  CodeEvalDispatcherErrorCodes,
  parseDispatchResult,
  type CodeEvalDispatcher,
  type CodeEvalRuntimeLanguage,
  type DispatchInput,
  type DispatchResult,
} from "./codeEvalDispatcherTypes";

export const DEFAULT_LAMBDA_FUNCTION_BY_LANGUAGE = {
  PYTHON: "code-based-eval-executor-python",
  TYPESCRIPT: "code-based-eval-executor-node",
} satisfies Record<CodeEvalRuntimeLanguage, string>;

// Synchronous Lambda invokes hold the HTTP request open through cold starts and user code execution.
const LAMBDA_INVOKE_REQUEST_TIMEOUT_MS = 10_000;

type CodeEvalDispatcherErrorClassification = {
  code: CodeEvalDispatcherErrorCode;
  retryable?: boolean;
};

// Defensive: today our runners only emit non-retryable user-code codes, so
// this is only consulted if a future runner surfaces one of them via the
// user-code-error envelope.
const RETRYABLE_ERROR_CODES = new Set<CodeEvalDispatcherErrorCode>([
  CodeEvalDispatcherErrorCodes.TIMEOUT,
  CodeEvalDispatcherErrorCodes.LAMBDA_CONCURRENCY_LIMIT,
  CodeEvalDispatcherErrorCodes.LAMBDA_INVOCATION_ERROR,
]);

// Skipped from warn-level logging so routine user failures don't drown out
// infrastructure issues in Datadog.
const USER_ERROR_CODES = new Set<CodeEvalDispatcherErrorCode>([
  CodeEvalDispatcherErrorCodes.INVALID_RESULT,
  CodeEvalDispatcherErrorCodes.INVALID_SOURCE,
  CodeEvalDispatcherErrorCodes.PAYLOAD_TOO_LARGE,
  CodeEvalDispatcherErrorCodes.RESULT_TOO_LARGE,
  CodeEvalDispatcherErrorCodes.SOURCE_TOO_LARGE,
  CodeEvalDispatcherErrorCodes.USER_CODE_ERROR,
]);

const AWS_ERROR_CLASSIFICATION_BY_NAME: Record<
  string,
  CodeEvalDispatcherErrorClassification
> = {
  TooManyRequestsException: {
    code: CodeEvalDispatcherErrorCodes.LAMBDA_CONCURRENCY_LIMIT,
    retryable: true,
  },
  AccessDeniedException: {
    code: CodeEvalDispatcherErrorCodes.LAMBDA_CONFIGURATION_ERROR,
  },
  InvalidParameterValueException: {
    code: CodeEvalDispatcherErrorCodes.LAMBDA_CONFIGURATION_ERROR,
  },
  // Unified with the local pre-check so "payload too large" failures share
  // a single code regardless of which layer caught them.
  RequestTooLargeException: {
    code: CodeEvalDispatcherErrorCodes.PAYLOAD_TOO_LARGE,
  },
  ResourceNotFoundException: {
    code: CodeEvalDispatcherErrorCodes.LAMBDA_CONFIGURATION_ERROR,
  },
  ResourceConflictException: {
    code: CodeEvalDispatcherErrorCodes.LAMBDA_INVOCATION_ERROR,
    retryable: true,
  },
  ServiceException: {
    code: CodeEvalDispatcherErrorCodes.LAMBDA_INVOCATION_ERROR,
    retryable: true,
  },
};

const AWS_ERROR_CLASSIFICATION_BY_CODE: Record<
  string,
  CodeEvalDispatcherErrorClassification
> = {
  ECONNRESET: {
    code: CodeEvalDispatcherErrorCodes.LAMBDA_INVOCATION_ERROR,
    retryable: true,
  },
  ETIMEDOUT: {
    code: CodeEvalDispatcherErrorCodes.LAMBDA_INVOCATION_ERROR,
    retryable: true,
  },
};

// `.strict()` ensures a runner that returns a valid dispatch result alongside
// an `error` field (e.g. `{ scores: [...], error: { code, message } }`) cannot
// match here — defense in depth for the user-code envelope.
const UserCodeErrorFieldsSchema = z
  .object({
    code: CodeEvalDispatcherErrorCode,
    message: z.string(),
  })
  .strict();

const UserCodeErrorSchema = z.union([
  z
    .object({ error: UserCodeErrorFieldsSchema })
    .strict()
    .transform(({ error }) => error),
  UserCodeErrorFieldsSchema,
]);

type UserCodeError = z.infer<typeof UserCodeErrorSchema>;

// Process-singleton client so the AWS SDK's Keep-Alive connection pool is
// reused across all dispatcher instances. In practice the process sees one
// endpoint for its lifetime (real AWS or the Floci dev endpoint); the
// endpoint-mismatch guard exists so a future caller that passes a different
// endpoint without injecting a client doesn't silently get a stale one.
let sharedLambdaClient: LambdaClient | undefined;
let sharedLambdaClientEndpoint: string | undefined;

function getSharedLambdaClient(endpoint?: string): LambdaClient {
  if (sharedLambdaClient && sharedLambdaClientEndpoint === endpoint) {
    return sharedLambdaClient;
  }
  sharedLambdaClient = new LambdaClient({
    ...(endpoint ? { endpoint } : {}),
    requestHandler: {
      requestTimeout: LAMBDA_INVOKE_REQUEST_TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
  });
  sharedLambdaClientEndpoint = endpoint;
  return sharedLambdaClient;
}

export class AwsLambdaCodeEvalDispatcher implements CodeEvalDispatcher {
  public readonly name = "aws-lambda";
  private readonly lambdaClient: LambdaClient;
  private readonly functionNameByLanguage: Record<
    CodeEvalRuntimeLanguage,
    string
  >;

  constructor(params?: {
    lambdaClient?: LambdaClient;
    endpoint?: string;
    functionNameByLanguage?: Partial<Record<CodeEvalRuntimeLanguage, string>>;
  }) {
    this.lambdaClient =
      params?.lambdaClient ?? getSharedLambdaClient(params?.endpoint);
    this.functionNameByLanguage = {
      ...DEFAULT_LAMBDA_FUNCTION_BY_LANGUAGE,
      ...params?.functionNameByLanguage,
    };
  }

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    return instrumentAsync(
      {
        name: "code-eval.dispatch.aws-lambda",
        spanKind: SpanKind.CLIENT,
        traceScope: "code-eval-dispatcher",
        startNewTrace: true,
      },
      async (span) => this.dispatchWithTracing(input, span),
    );
  }

  private async dispatchWithTracing(
    input: DispatchInput,
    span: Span,
  ): Promise<DispatchResult> {
    const serializedPayload = assertDispatchInputWithinLimits(input);
    const functionName = this.functionNameByLanguage[input.runtime.language];

    span.setAttributes({
      "langfuse.code_eval.dispatcher": this.name,
      "langfuse.code_eval.runtime.language": input.runtime.language,
      "langfuse.code_eval.lambda.function_name": functionName,
      "langfuse.code_eval.payload.bytes": Buffer.byteLength(
        serializedPayload,
        "utf8",
      ),
      "langfuse.organization.id": input.scope.organizationId,
      "langfuse.project.id": input.scope.projectId,
      "langfuse.evaluator.id": input.scope.evaluatorId,
      "langfuse.eval.job_execution_id": input.execution.jobExecutionId,
    });

    try {
      const commandInput: InvokeCommandInput = {
        FunctionName: functionName,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(serializedPayload),
        TenantId: `${input.scope.organizationId}:${input.scope.projectId}`,
      };

      const response = await this.lambdaClient.send(
        new InvokeCommand(commandInput),
      );
      setSpanAttributes(span, {
        ...getAwsMetadataSpanAttributes(response.$metadata),
        "langfuse.code_eval.lambda.status_code": response.StatusCode,
        "langfuse.code_eval.lambda.executed_version": response.ExecutedVersion,
        "langfuse.code_eval.lambda.function_error": response.FunctionError,
      });

      // Lambda function errors come back as HTTP 200 with `FunctionError`
      // set; the SDK does NOT throw for these. SDK service exceptions
      // (throttling, auth, etc.) hit the outer catch instead.
      // https://docs.aws.amazon.com/lambda/latest/dg/invocation-errors.html
      if (response.FunctionError) {
        const dispatcherError = classifyLambdaFunctionError({
          functionName,
          functionError: response.FunctionError,
          payload: response.Payload,
        });
        traceLambdaFunctionError({
          span,
          functionName,
          functionError: response.FunctionError,
          payload: response.Payload,
        });
        throw dispatcherError;
      }

      if (!response.Payload) {
        throw new CodeEvalDispatcherError(
          `Code eval Lambda ${functionName} returned an empty response`,
          {
            code: CodeEvalDispatcherErrorCodes.LAMBDA_INVOCATION_ERROR,
            retryable: true,
          },
        );
      }

      span.setAttribute(
        "langfuse.code_eval.lambda.response_payload.bytes",
        response.Payload.byteLength,
      );

      const result = parseLambdaResponsePayload({
        functionName,
        payload: response.Payload,
      });
      span.setAttribute(
        "langfuse.code_eval.result.score_count",
        result.scores.length,
      );
      return result;
    } catch (error) {
      if (error instanceof CodeEvalDispatcherError) {
        setDispatcherErrorSpanAttributes(span, error);
        logDispatcherError({ functionName, error });
        throw error;
      }

      traceException(error, span, "code_eval.aws_lambda.original_error");
      const errorRecord = isRecord(error) ? error : null;
      setSpanAttributes(span, {
        ...getAwsMetadataSpanAttributes(errorRecord?.$metadata),
        "langfuse.code_eval.aws_error.name":
          error instanceof Error ? error.name : undefined,
        "langfuse.code_eval.aws_error.code":
          typeof errorRecord?.code === "string" ? errorRecord.code : undefined,
      });
      const awsError = classifyAwsLambdaError(error);
      const dispatcherError = new CodeEvalDispatcherError(
        `Failed to invoke code eval Lambda ${functionName}: ${error instanceof Error ? error.message : String(error)}`,
        { ...awsError, cause: error },
      );
      setDispatcherErrorSpanAttributes(span, dispatcherError);
      logDispatcherError({ functionName, error: dispatcherError });
      throw dispatcherError;
    }
  }
}

// Warn on non-user errors only, so infrastructure issues surface in Datadog
// without drowning the channel in routine user-template failures.
function logDispatcherError(params: {
  functionName: string;
  error: CodeEvalDispatcherError;
}): void {
  if (USER_ERROR_CODES.has(params.error.code)) return;

  logger.warn(
    `Code eval Lambda ${params.functionName} dispatcher failed: ${params.error.message}`,
    {
      code: params.error.code,
      retryable: params.error.retryable,
    },
  );
}

function setDispatcherErrorSpanAttributes(
  span: Span,
  error: CodeEvalDispatcherError,
): void {
  span.setAttributes({
    "langfuse.code_eval.error.code": error.code,
    "langfuse.code_eval.error.retryable": error.retryable,
  });
}

function getAwsMetadataSpanAttributes(
  metadata: unknown,
): Record<string, AttributeValue | undefined> {
  if (!isRecord(metadata)) return {};

  return {
    "aws.request_id":
      typeof metadata.requestId === "string" ? metadata.requestId : undefined,
    "aws.http_status_code":
      typeof metadata.httpStatusCode === "number"
        ? metadata.httpStatusCode
        : undefined,
    "aws.sdk.attempts":
      typeof metadata.attempts === "number" ? metadata.attempts : undefined,
    "aws.sdk.total_retry_delay_ms":
      typeof metadata.totalRetryDelay === "number"
        ? metadata.totalRetryDelay
        : undefined,
  };
}

function setSpanAttributes(
  span: Span,
  attributes: Record<string, AttributeValue | undefined>,
): void {
  const definedAttributes = Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== undefined),
  ) as Record<string, AttributeValue>;

  if (Object.keys(definedAttributes).length > 0) {
    span.setAttributes(definedAttributes);
  }
}

function traceLambdaFunctionError(params: {
  span: Span;
  functionName: string;
  functionError: string;
  payload: Uint8Array | undefined;
}): void {
  const errorPayload = parseLambdaErrorPayload(params.payload);
  const record = isRecord(errorPayload) ? errorPayload : null;

  const error = new Error(
    typeof record?.errorMessage === "string"
      ? record.errorMessage
      : `Code eval Lambda ${params.functionName} returned FunctionError=${params.functionError}`,
  );
  error.name =
    typeof record?.errorType === "string"
      ? record.errorType
      : "LambdaFunctionError";

  if (Array.isArray(record?.stackTrace)) {
    error.stack = record.stackTrace
      .filter((line) => typeof line === "string")
      .join("\n");
  }

  traceException(error, params.span, "code_eval.aws_lambda.function_error");
}

function classifyLambdaFunctionError(params: {
  functionName: string;
  functionError: string;
  payload: Uint8Array | undefined;
}): CodeEvalDispatcherError {
  const errorPayload = parseLambdaErrorPayload(params.payload);

  // Our runners emit `{ error: { code, message } }` on user-code failures.
  const userCodeError = parseUserCodeError(errorPayload);
  if (userCodeError) {
    return createCodeEvalDispatcherErrorFromUserCodeError(userCodeError);
  }

  // AWS-runtime error envelope: `{ errorMessage, errorType, stackTrace? }`.
  const record = isRecord(errorPayload) ? errorPayload : null;
  const errorType =
    typeof record?.errorType === "string" ? record.errorType : null;
  const errorMessage =
    typeof record?.errorMessage === "string" ? record.errorMessage : null;
  const composedMessage =
    errorType && errorMessage
      ? `${errorType}: ${errorMessage}`
      : (errorMessage ?? errorType ?? "");

  if (
    errorType === "Function.TimedOut" ||
    errorType === "Sandbox.Timedout" ||
    (errorMessage && isTimeoutErrorMessage(errorMessage))
  ) {
    return new CodeEvalDispatcherError(
      composedMessage || "Lambda task timed out",
      { code: CodeEvalDispatcherErrorCodes.TIMEOUT, retryable: true },
    );
  }

  // Abnormal runtime exit (OOM kill, segfault, process.exit, SIGKILL).
  // Retrying never recovers from these.
  if (errorType === "Runtime.ExitError") {
    return new CodeEvalDispatcherError(
      composedMessage || "Lambda runtime exited abnormally",
      {
        code: CodeEvalDispatcherErrorCodes.LAMBDA_CONFIGURATION_ERROR,
        retryable: false,
      },
    );
  }

  // The managed runtime caught a user-code exception and populated
  // errorType + errorMessage with the language-specific class and message.
  if (params.functionError === "Handled") {
    return new CodeEvalDispatcherError(
      composedMessage || "Evaluator code threw an uncaught exception",
      { code: CodeEvalDispatcherErrorCodes.USER_CODE_ERROR, retryable: false },
    );
  }

  // Unknown failure — default retryable so a flake doesn't burn the job.
  return new CodeEvalDispatcherError(
    composedMessage ||
      `Code eval Lambda ${params.functionName} failed with ${params.functionError}`,
    {
      code: CodeEvalDispatcherErrorCodes.LAMBDA_INVOCATION_ERROR,
      retryable: true,
    },
  );
}

function createCodeEvalDispatcherErrorFromUserCodeError(
  userCodeError: UserCodeError,
): CodeEvalDispatcherError {
  return new CodeEvalDispatcherError(userCodeError.message, {
    code: userCodeError.code,
    retryable: RETRYABLE_ERROR_CODES.has(userCodeError.code),
  });
}

function classifyAwsLambdaError(
  error: unknown,
): CodeEvalDispatcherErrorClassification {
  if (!(error instanceof Error)) {
    return {
      code: CodeEvalDispatcherErrorCodes.LAMBDA_INVOCATION_ERROR,
      retryable: true,
    };
  }

  const errorCode = (error as { code?: unknown }).code;

  return (
    AWS_ERROR_CLASSIFICATION_BY_NAME[error.name] ??
    (typeof errorCode === "string"
      ? AWS_ERROR_CLASSIFICATION_BY_CODE[errorCode]
      : undefined) ?? {
      code: CodeEvalDispatcherErrorCodes.LAMBDA_INVOCATION_ERROR,
      retryable: true,
    }
  );
}

function parseLambdaResponsePayload(params: {
  functionName: string;
  payload: Uint8Array;
}): DispatchResult {
  assertDispatchResultWithinByteLimit(params.payload.byteLength);

  const responseBody = Buffer.from(params.payload).toString("utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody) as unknown;
  } catch (error) {
    throw new CodeEvalDispatcherError(
      `Code eval Lambda ${params.functionName} returned invalid JSON`,
      { code: CodeEvalDispatcherErrorCodes.INVALID_RESULT, cause: error },
    );
  }

  // Try the success shape first so a runner can't smuggle an `error`
  // envelope alongside valid scores to force a retry or mask the outcome.
  try {
    return parseDispatchResult(parsed);
  } catch (dispatchError) {
    const userCodeError = parseUserCodeError(parsed);
    if (userCodeError) {
      throw createCodeEvalDispatcherErrorFromUserCodeError(userCodeError);
    }
    throw dispatchError;
  }
}

function parseUserCodeError(payload: unknown): UserCodeError | null {
  return UserCodeErrorSchema.safeParse(payload).data ?? null;
}

function parseLambdaErrorPayload(payload: Uint8Array | undefined): unknown {
  if (!payload) return null;

  try {
    return JSON.parse(Buffer.from(payload).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function isTimeoutErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("task timed out") || normalized.includes("timeout")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
