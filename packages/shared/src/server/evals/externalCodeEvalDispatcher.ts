import { SpanKind, type Span } from "@opentelemetry/api";
import { instrumentAsync } from "../instrumentation";
import {
  assertDispatchInputWithinLimits,
  assertDispatchResultWithinByteLimit,
  CodeEvalDispatcherError,
  CodeEvalDispatcherErrorCodes,
  parseDispatchResult,
  type CodeEvalDispatcher,
  type DispatchInput,
  type DispatchResult,
} from "./codeEvalDispatcherTypes";

// External invokes hold the HTTP request open through cold starts and user code execution.
const EXTERNAL_INVOKE_REQUEST_TIMEOUT_MS = 10_000;

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
    let responseText: string;

    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: serializedPayload,
        signal: timeoutSignal,
      });
      responseText = await response.text();
    } catch (error) {
      if (timeoutSignal.aborted) {
        throw new CodeEvalDispatcherError(
          `External code eval request timed out after ${EXTERNAL_INVOKE_REQUEST_TIMEOUT_MS}ms`,
          {
            code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
            retryable: true,
            cause: error,
          },
        );
      }

      throw error;
    }

    const responseBytes = Buffer.byteLength(responseText, "utf8");
    assertDispatchResultWithinByteLimit(responseBytes);

    span.setAttributes({
      "langfuse.code_eval.external.status_code": response.status,
      "langfuse.code_eval.external.response_payload.bytes": responseBytes,
    });

    if (!response.ok) {
      throw new CodeEvalDispatcherError(
        `External code eval returned status ${response.status}`,
        { code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR },
      );
    }

    const parsed = JSON.parse(responseText) as unknown;
    const result = parseDispatchResult(parsed);
    span.setAttribute("eval.score.count", result.scores.length);

    return result;
  }
}
