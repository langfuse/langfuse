import { SpanKind, type Span } from "@opentelemetry/api";
import { z } from "zod";
import { instrumentAsync } from "../instrumentation";
import {
  assertDispatchInputWithinLimits,
  assertDispatchResultWithinByteLimit,
  CodeEvalDispatcherError,
  CodeEvalDispatcherErrorCode,
  CodeEvalDispatcherErrorCodes,
  parseDispatchResult,
  type CodeEvalDispatcher,
  type DispatchInput,
  type DispatchResult,
} from "./codeEvalDispatcherTypes";

// External invokes hold the HTTP request open through cold starts and user code execution.
const EXTERNAL_INVOKE_REQUEST_TIMEOUT_MS = 10_000;

// Mirrors ResourceConflictException, TooManyRequestsException, and
// ServiceException from the Lambda dispatcher.
const RETRYABLE_EXTERNAL_HTTP_STATUS_CODES = new Set([409, 429, 500]);

const RETRYABLE_ERROR_CODES = new Set<CodeEvalDispatcherErrorCode>([
  CodeEvalDispatcherErrorCodes.TIMEOUT,
  CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
]);

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

export class ExternalCodeEvalDispatcher implements CodeEvalDispatcher {
  public readonly name = "external";
  private readonly endpoint: string;

  constructor(params: { endpoint: string }) {
    this.endpoint = params.endpoint;
  }

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    return instrumentAsync(
      {
        name: "code-eval.dispatch.external",
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
    span.setAttributes({
      "eval.dispatcher.name": this.name,
      "eval.job_execution.id": input.execution.jobExecutionId,
      "eval.runner.language": input.runtime.language,
      "eval.template.id": input.scope.evaluatorId,
      "langfuse.org.id": input.scope.organizationId,
      "langfuse.project.id": input.scope.projectId,
    });

    const serializedPayload = assertDispatchInputWithinLimits(input);
    span.setAttribute(
      "langfuse.code_eval.payload.bytes",
      Buffer.byteLength(serializedPayload, "utf8"),
    );

    const timeoutSignal = AbortSignal.timeout(
      EXTERNAL_INVOKE_REQUEST_TIMEOUT_MS,
    );
    let response: Response;

    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: serializedPayload,
        redirect: "manual",
        signal: timeoutSignal,
      });
    } catch (error) {
      if (timeoutSignal.aborted) {
        throw new CodeEvalDispatcherError(
          `External code eval request timed out after ${EXTERNAL_INVOKE_REQUEST_TIMEOUT_MS}ms`,
          {
            code: CodeEvalDispatcherErrorCodes.TIMEOUT,
            retryable: true,
            cause: error,
          },
        );
      }

      throw new CodeEvalDispatcherError(
        `Failed to invoke external code eval: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
          retryable: true,
          cause: error,
        },
      );
    }

    span.setAttribute(
      "langfuse.code_eval.external.status_code",
      response.status,
    );

    if (!response.ok) {
      throw new CodeEvalDispatcherError(
        `External code eval returned status ${response.status}`,
        {
          code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
          retryable: RETRYABLE_EXTERNAL_HTTP_STATUS_CODES.has(response.status),
        },
      );
    }

    let responseText: string;
    try {
      responseText = await response.text();
    } catch (error) {
      throw new CodeEvalDispatcherError(
        `Failed to read external code eval response: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
          retryable: true,
          cause: error,
        },
      );
    }

    const responseBytes = Buffer.byteLength(responseText, "utf8");
    span.setAttribute(
      "langfuse.code_eval.external.response_payload.bytes",
      responseBytes,
    );
    assertDispatchResultWithinByteLimit(responseBytes);

    const result = parseExternalResponsePayload(responseText);
    span.setAttribute("eval.score.count", result.scores.length);

    return result;
  }
}

function parseExternalResponsePayload(responseBody: string): DispatchResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody) as unknown;
  } catch (error) {
    throw new CodeEvalDispatcherError(
      "External code eval returned invalid JSON",
      {
        code: CodeEvalDispatcherErrorCodes.INVALID_RESULT,
        cause: error,
      },
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

function createCodeEvalDispatcherErrorFromUserCodeError(
  userCodeError: UserCodeError,
): CodeEvalDispatcherError {
  return new CodeEvalDispatcherError(userCodeError.message, {
    code: userCodeError.code,
    retryable: RETRYABLE_ERROR_CODES.has(userCodeError.code),
  });
}
