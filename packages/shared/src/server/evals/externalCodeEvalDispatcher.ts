import { SpanKind, type Span } from "@opentelemetry/api";
import { backOff } from "exponential-backoff";
import { instrumentAsync, recordDistribution } from "../instrumentation";
import { logger } from "../logger";
import { addSecureOutboundConnectionValidation } from "../outbound-url/connection";
import { urlForLog } from "../outbound-url/fetch";
import {
  OutboundUrlValidationError,
  parseOutboundUrl,
  type OutboundUrlValidationWhitelist,
} from "../outbound-url/validation";
import {
  buildWebhookRequestHeaders,
  type RequestHeaders,
} from "../utils/headerUtils";
import { validateWebhookURL } from "../webhooks/validation";
import {
  assertDispatchInputWithinLimits,
  assertDispatchResultWithinByteLimit,
  CODE_EVAL_DISPATCH_RESULT_MAX_BYTES,
  CODE_EVAL_USER_ERROR_CODES,
  CodeEvalDispatcherError,
  CodeEvalDispatcherErrorCodes,
  parseCodeEvalUserCodeError,
  parseDispatchResult,
  type CodeEvalDispatcher,
  type DispatchInput,
} from "./codeEvalDispatcherTypes";

type SourceCodeLanguage = DispatchInput["runtime"]["language"];

// Bump when the request or response contract changes incompatibly.
const CODE_EVAL_DISPATCH_API_VERSION = "v1";
const EXTERNAL_RETRY_STARTING_DELAY_MS = 100;
const EXTERNAL_RETRY_MAX_DELAY_MS = 2_000;
const EXTERNAL_LOG_CONTEXT = "Code eval external dispatcher";
const USER_CODE_ERROR_STATUS = 422;
const PAYLOAD_TOO_LARGE_STATUS = 413;
const RETRYABLE_CLIENT_ERROR_STATUSES = new Set([408, 425, 429]);

/**
 * Sends code evals to an operator-run executor over HTTP, signed like
 * webhooks. Retries mirror the Lambda SDK: a few jittered attempts per job,
 * with the queue retrying whatever stays retryable.
 */
export class ExternalCodeEvalDispatcher implements CodeEvalDispatcher {
  public readonly name = "external";
  private readonly endpoint: string;
  private readonly signingSecret: string;
  private readonly customHeaders: RequestHeaders;
  private readonly timeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly maxAttempts: number;
  private readonly languages: ReadonlySet<SourceCodeLanguage>;
  private readonly whitelist: OutboundUrlValidationWhitelist;

  constructor(params: {
    endpoint: string;
    signingSecret: string;
    headers: Record<string, string>;
    timeoutMs: number;
    connectTimeoutMs: number;
    maxAttempts: number;
    languages: SourceCodeLanguage[];
  }) {
    const endpointUrl = parseOutboundUrl(params.endpoint);
    this.endpoint = endpointUrl.href;
    this.signingSecret = params.signingSecret;
    this.timeoutMs = params.timeoutMs;
    this.connectTimeoutMs = params.connectTimeoutMs;
    this.maxAttempts = params.maxAttempts;
    this.languages = new Set(params.languages);
    this.customHeaders = Object.fromEntries(
      Object.entries(params.headers).map(([name, value]) => [
        name,
        { secret: true, value },
      ]),
    );
    // The operator configured this endpoint, so it may be a private
    // in-cluster address. The positive allowlist permits exactly that host.
    this.whitelist = {
      hosts: [],
      ips: [],
      ip_ranges: [],
      allowedHosts: [endpointUrl.hostname],
    };
  }

  async dispatch(input: DispatchInput) {
    return instrumentAsync(
      {
        name: "code-eval.dispatch.external",
        spanKind: SpanKind.CLIENT,
        traceScope: "code-eval-dispatcher",
        startNewTrace: true,
      },
      async (span) => {
        const startTime = Date.now();
        try {
          return await this.dispatchWithTracing(input, span);
        } finally {
          recordDistribution(
            "langfuse.code_eval.dispatch_duration",
            Date.now() - startTime,
            {
              dispatcher: this.name,
              project_id: input.scope.projectId,
              language: input.runtime.language,
              unit: "milliseconds",
            },
          );
        }
      },
    );
  }

  private async dispatchWithTracing(input: DispatchInput, span: Span) {
    span.setAttributes({
      "eval.dispatcher.name": this.name,
      "eval.job_execution.id": input.execution.jobExecutionId,
      "eval.runner.language": input.runtime.language,
      "eval.template.id": input.scope.evaluatorId,
      "langfuse.org.id": input.scope.organizationId,
      "langfuse.project.id": input.scope.projectId,
      "server.address": new URL(this.endpoint).host,
    });

    let attempts = 0;
    try {
      if (!this.languages.has(input.runtime.language)) {
        throw new CodeEvalDispatcherError(
          `Code eval external executor is not configured for ${input.runtime.language} evaluators`,
          { code: CodeEvalDispatcherErrorCodes.UNSUPPORTED_RUNTIME },
        );
      }

      const request = { apiVersion: CODE_EVAL_DISPATCH_API_VERSION, ...input };
      const body = assertDispatchInputWithinLimits(request);
      span.setAttribute(
        "langfuse.code_eval.payload.bytes",
        Buffer.byteLength(body, "utf8"),
      );

      const result = await backOff(
        () => {
          attempts++;
          return this.sendRequest(body, span);
        },
        {
          numOfAttempts: this.maxAttempts,
          startingDelay: EXTERNAL_RETRY_STARTING_DELAY_MS,
          maxDelay: EXTERNAL_RETRY_MAX_DELAY_MS,
          jitter: "full",
          retry: (error) =>
            error instanceof CodeEvalDispatcherError && error.retryable,
        },
      );
      span.setAttribute("eval.score.count", result.scores.length);
      return result;
    } catch (error) {
      if (!(error instanceof CodeEvalDispatcherError)) throw error;
      span.setAttributes({
        "langfuse.code_eval.error.code": error.code,
        "langfuse.code_eval.error.retryable": error.retryable,
      });
      if (!CODE_EVAL_USER_ERROR_CODES.has(error.code)) {
        logger.warn(`Code eval external dispatcher failed: ${error.message}`, {
          code: error.code,
          retryable: error.retryable,
          endpoint: urlForLog(this.endpoint),
          attempts,
        });
      }
      throw error;
    } finally {
      span.setAttribute("langfuse.code_eval.external.attempts", attempts);
    }
  }

  private async sendRequest(body: string, span: Span) {
    // Signed per attempt so the signature timestamp stays fresh on retries.
    const { headers } = buildWebhookRequestHeaders({
      customHeaders: this.customHeaders,
      body,
      signingSecret: this.signingSecret,
    });
    const signal = AbortSignal.timeout(this.timeoutMs);

    try {
      await validateExternalEndpointUrl(this.endpoint, this.whitelist);
      // Redirects are never followed; a 3xx is reported as misconfiguration.
      const response = await fetch(
        this.endpoint,
        addSecureOutboundConnectionValidation(
          { method: "POST", body, headers, signal, redirect: "manual" },
          {
            whitelist: this.whitelist,
            logContext: EXTERNAL_LOG_CONTEXT,
            connectTimeoutMs: this.connectTimeoutMs,
          },
        ),
      );
      span.setAttribute("http.response.status_code", response.status);
      return await parseExternalResponse(response, span);
    } catch (error) {
      if (error instanceof CodeEvalDispatcherError) throw error;
      throw toExternalDispatcherError({
        error,
        timedOut: signal.aborted,
        timeoutMs: this.timeoutMs,
      });
    }
  }
}

// Ports are open: in-cluster executors commonly listen on e.g. 8080.
function validateExternalEndpointUrl(
  url: string,
  whitelist?: OutboundUrlValidationWhitelist,
) {
  return validateWebhookURL(url, whitelist, { allowedPorts: "any" });
}

async function parseExternalResponse(response: Response, span: Span) {
  if (!response.ok && response.status !== USER_CODE_ERROR_STATUS) {
    await response.body?.cancel();
    throw errorForStatus(response.status);
  }

  const responseBody = await readResponseBodyWithinLimit(response);
  span.setAttribute(
    "langfuse.code_eval.external.response.bytes",
    responseBody.byteLength,
  );
  const parsed = parseJsonOrUndefined(responseBody.toString("utf8"));
  if (parsed === undefined) {
    throw new CodeEvalDispatcherError(
      `Code eval external endpoint responded with HTTP ${response.status} and a body that is not JSON`,
      { code: CodeEvalDispatcherErrorCodes.EXTERNAL_CONFIGURATION_ERROR },
    );
  }
  const userCodeError = parseCodeEvalUserCodeError(parsed);

  if (response.status === USER_CODE_ERROR_STATUS) {
    if (!userCodeError) {
      throw new CodeEvalDispatcherError(
        `Code eval external endpoint responded with HTTP ${USER_CODE_ERROR_STATUS} without an { error: { code, message } } body`,
        { code: CodeEvalDispatcherErrorCodes.EXTERNAL_CONFIGURATION_ERROR },
      );
    }
    throw new CodeEvalDispatcherError(userCodeError.message, {
      code: userCodeError.code,
    });
  }

  // Try the success shape first so an executor can't smuggle an `error`
  // envelope alongside valid scores to mask the outcome.
  try {
    return parseDispatchResult(parsed);
  } catch (dispatchError) {
    if (userCodeError) {
      throw new CodeEvalDispatcherError(userCodeError.message, {
        code: userCodeError.code,
      });
    }
    throw dispatchError;
  }
}

function errorForStatus(status: number) {
  if (status === PAYLOAD_TOO_LARGE_STATUS) {
    return new CodeEvalDispatcherError(
      "Code eval external endpoint rejected the payload as too large",
      { code: CodeEvalDispatcherErrorCodes.PAYLOAD_TOO_LARGE },
    );
  }

  const retryable =
    status >= 500 || RETRYABLE_CLIENT_ERROR_STATUSES.has(status);
  return new CodeEvalDispatcherError(
    `Code eval external endpoint responded with HTTP ${status}`,
    {
      code: retryable
        ? CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR
        : CodeEvalDispatcherErrorCodes.EXTERNAL_CONFIGURATION_ERROR,
      retryable,
    },
  );
}

function toExternalDispatcherError(params: {
  error: unknown;
  timedOut: boolean;
  timeoutMs: number;
}) {
  const { error, timedOut, timeoutMs } = params;
  if (timedOut) {
    return new CodeEvalDispatcherError(
      `Code eval external endpoint did not respond within ${timeoutMs}ms`,
      {
        code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
        retryable: true,
        cause: error,
      },
    );
  }

  if (error instanceof OutboundUrlValidationError) {
    return new CodeEvalDispatcherError(
      `Code eval external endpoint is not allowed: ${error.message}`,
      {
        code: CodeEvalDispatcherErrorCodes.EXTERNAL_CONFIGURATION_ERROR,
        cause: error,
      },
    );
  }

  return new CodeEvalDispatcherError(
    `Failed to reach code eval external endpoint: ${describeError(error)}`,
    {
      code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
      retryable: true,
      cause: error,
    },
  );
}

// Streams the body so a runaway executor can't make the worker buffer more
// than the result limit.
async function readResponseBodyWithinLimit(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (contentLength > CODE_EVAL_DISPATCH_RESULT_MAX_BYTES) {
    await response.body?.cancel();
    assertDispatchResultWithinByteLimit(contentLength);
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let chunk = await reader.read();
  while (!chunk.done) {
    byteLength += chunk.value.byteLength;
    if (byteLength > CODE_EVAL_DISPATCH_RESULT_MAX_BYTES) {
      await reader.cancel();
      assertDispatchResultWithinByteLimit(byteLength);
    }
    chunks.push(chunk.value);
    chunk = await reader.read();
  }
  return Buffer.concat(chunks);
}

function parseJsonOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// fetch wraps socket failures as `TypeError: fetch failed`; the cause names
// the real problem (refused connection, connect timeout, DNS). Other messages
// are dropped because request-building errors can echo header values.
function describeError(error: unknown) {
  if (!(error instanceof Error)) return "unknown error";
  return error.cause instanceof Error
    ? `${error.message}: ${error.cause.message}`
    : error.name;
}
