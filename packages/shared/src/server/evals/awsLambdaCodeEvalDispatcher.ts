import {
  InvokeCommand,
  LambdaClient,
  type InvokeCommandInput,
} from "@aws-sdk/client-lambda";
import { z } from "zod";
import { logger } from "../logger";
import {
  assertDispatchInputWithinLimits,
  assertDispatchResultWithinByteLimit,
  CodeEvalDispatcherError,
  CodeEvalDispatcherErrorCode,
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

type CodeEvalDispatcherErrorClassification = {
  code: CodeEvalDispatcherErrorCode;
  retryable?: boolean;
};

// Defensive: today our runners only emit non-retryable user-code codes, so
// this is only consulted if a future runner surfaces one of them via the
// user-code-error envelope.
const RETRYABLE_ERROR_CODES = new Set<CodeEvalDispatcherErrorCode>([
  "TIMEOUT",
  "LAMBDA_CONCURRENCY_LIMIT",
  "LAMBDA_INVOCATION_ERROR",
]);

// Skipped from warn-level logging so routine user failures don't drown out
// infrastructure issues in Datadog.
const USER_ERROR_CODES = new Set<CodeEvalDispatcherErrorCode>([
  "INVALID_RESULT",
  "INVALID_SOURCE",
  "PAYLOAD_TOO_LARGE",
  "RESULT_TOO_LARGE",
  "SOURCE_TOO_LARGE",
  "USER_CODE_ERROR",
]);

const AWS_ERROR_CLASSIFICATION_BY_NAME: Record<
  string,
  CodeEvalDispatcherErrorClassification
> = {
  TooManyRequestsException: {
    code: "LAMBDA_CONCURRENCY_LIMIT",
    retryable: true,
  },
  AccessDeniedException: { code: "LAMBDA_CONFIGURATION_ERROR" },
  InvalidParameterValueException: { code: "LAMBDA_CONFIGURATION_ERROR" },
  // Unified with the local pre-check so "payload too large" failures share
  // a single code regardless of which layer caught them.
  RequestTooLargeException: { code: "PAYLOAD_TOO_LARGE" },
  ResourceNotFoundException: { code: "LAMBDA_CONFIGURATION_ERROR" },
  ECONNRESET: { code: "LAMBDA_INVOCATION_ERROR", retryable: true },
  ETIMEDOUT: { code: "LAMBDA_INVOCATION_ERROR", retryable: true },
  ResourceConflictException: {
    code: "LAMBDA_INVOCATION_ERROR",
    retryable: true,
  },
  ServiceException: { code: "LAMBDA_INVOCATION_ERROR", retryable: true },
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
      params?.lambdaClient ??
      new LambdaClient(params?.endpoint ? { endpoint: params.endpoint } : {});
    this.functionNameByLanguage = {
      ...DEFAULT_LAMBDA_FUNCTION_BY_LANGUAGE,
      ...params?.functionNameByLanguage,
    };
  }

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const serializedPayload = assertDispatchInputWithinLimits(input);
    const functionName = this.functionNameByLanguage[input.runtime.language];

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

      // Lambda function errors come back as HTTP 200 with `FunctionError`
      // set; the SDK does NOT throw for these. SDK service exceptions
      // (throttling, auth, etc.) hit the outer catch instead.
      // https://docs.aws.amazon.com/lambda/latest/dg/invocation-errors.html
      if (response.FunctionError) {
        throw classifyLambdaFunctionError({
          functionName,
          functionError: response.FunctionError,
          payload: response.Payload,
        });
      }

      if (!response.Payload) {
        throw new CodeEvalDispatcherError(
          `Code eval Lambda ${functionName} returned an empty response`,
          { code: "LAMBDA_INVOCATION_ERROR", retryable: true },
        );
      }

      return parseLambdaResponsePayload({
        functionName,
        payload: response.Payload,
      });
    } catch (error) {
      if (error instanceof CodeEvalDispatcherError) {
        logDispatcherError({ functionName, error });
        throw error;
      }

      const awsError = classifyAwsLambdaError(error);
      const dispatcherError = new CodeEvalDispatcherError(
        `Failed to invoke code eval Lambda ${functionName}: ${error instanceof Error ? error.message : String(error)}`,
        { ...awsError, cause: error },
      );
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
      { code: "TIMEOUT", retryable: true },
    );
  }

  // Abnormal runtime exit (OOM kill, segfault, process.exit, SIGKILL).
  // Retrying never recovers from these.
  if (errorType === "Runtime.ExitError") {
    return new CodeEvalDispatcherError(
      composedMessage || "Lambda runtime exited abnormally",
      { code: "LAMBDA_CONFIGURATION_ERROR", retryable: false },
    );
  }

  // The managed runtime caught a user-code exception and populated
  // errorType + errorMessage with the language-specific class and message.
  if (params.functionError === "Handled") {
    return new CodeEvalDispatcherError(
      composedMessage || "Evaluator code threw an uncaught exception",
      { code: "USER_CODE_ERROR", retryable: false },
    );
  }

  // Unknown failure — default retryable so a flake doesn't burn the job.
  return new CodeEvalDispatcherError(
    composedMessage ||
      `Code eval Lambda ${params.functionName} failed with ${params.functionError}`,
    { code: "LAMBDA_INVOCATION_ERROR", retryable: true },
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
    return { code: "LAMBDA_INVOCATION_ERROR", retryable: true };
  }

  return (
    AWS_ERROR_CLASSIFICATION_BY_NAME[error.name] ?? {
      code: "LAMBDA_INVOCATION_ERROR",
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
      { code: "INVALID_RESULT", cause: error },
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
