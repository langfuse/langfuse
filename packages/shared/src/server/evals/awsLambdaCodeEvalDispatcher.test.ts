import { SpanKind } from "@opentelemetry/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AwsLambdaCodeEvalDispatcher } from "./awsLambdaCodeEvalDispatcher";
import type { DispatchInput } from "./codeEvalDispatcherTypes";

const mocks = vi.hoisted(() => {
  const span = {
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
  };

  return {
    span,
    instrumentAsync: vi.fn(async (_ctx, callback) => callback(span)),
    traceException: vi.fn(),
  };
});

vi.mock("../instrumentation", () => ({
  instrumentAsync: mocks.instrumentAsync,
  traceException: mocks.traceException,
}));

vi.mock("../logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

const baseInput: DispatchInput = {
  scope: {
    organizationId: "org-1",
    projectId: "project-1",
    evaluatorId: "evaluator-1",
  },
  runtime: { language: "TYPESCRIPT" },
  execution: { jobExecutionId: "job-1" },
  code: { source: "function evaluate() {}" },
  payload: {
    observation: {
      input: null,
      output: null,
      metadata: null,
    },
  },
};

function expectSpanAttributes(attributes: Record<string, unknown>): void {
  expect(mocks.span.setAttributes).toHaveBeenCalledWith(
    expect.objectContaining(attributes),
  );
}

describe("AwsLambdaCodeEvalDispatcher observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches inside a dedicated trace with code evaluator context", async () => {
    const send = vi.fn().mockResolvedValue({
      StatusCode: 200,
      ExecutedVersion: "$LATEST",
      Payload: Buffer.from(
        JSON.stringify({
          scores: [{ name: "score", value: 1, dataType: "NUMERIC" }],
        }),
      ),
      $metadata: {
        requestId: "request-1",
        httpStatusCode: 200,
        attempts: 2,
        totalRetryDelay: 15,
      },
    });
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send } as any,
    });

    await dispatcher.dispatch(baseInput);

    expect(mocks.instrumentAsync).toHaveBeenCalledWith(
      {
        name: "code-eval.dispatch.aws-lambda",
        spanKind: SpanKind.CLIENT,
        traceScope: "code-eval-dispatcher",
        startNewTrace: true,
      },
      expect.any(Function),
    );
    expectSpanAttributes({
      "eval.dispatcher.name": "aws-lambda",
      "eval.job_execution.id": "job-1",
      "eval.runner.language": "TYPESCRIPT",
      "eval.template.id": "evaluator-1",
      "langfuse.code_eval.lambda.function_name":
        "code-based-eval-executor-node",
      "langfuse.org.id": "org-1",
      "langfuse.project.id": "project-1",
    });
    expect(mocks.span.setAttribute).toHaveBeenCalledWith("eval.score.count", 1);
    expectSpanAttributes({
      "langfuse.code_eval.lambda.status_code": 200,
      "langfuse.code_eval.lambda.executed_version": "$LATEST",
      "aws.request_id": "request-1",
      "aws.http_status_code": 200,
      "aws.sdk.attempts": 2,
      "aws.sdk.total_retry_delay_ms": 15,
    });
  });

  it("records the original AWS SDK error before throwing the derived dispatcher error", async () => {
    const error = Object.assign(new Error("Rate exceeded"), {
      code: "TooManyRequests",
      $metadata: {
        requestId: "request-2",
        httpStatusCode: 429,
        attempts: 3,
        totalRetryDelay: 25,
      },
    });
    error.name = "TooManyRequestsException";
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send: vi.fn().mockRejectedValue(error) } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
      code: "LAMBDA_CONCURRENCY_LIMIT",
      retryable: true,
    });

    expect(mocks.traceException).toHaveBeenCalledWith(
      error,
      mocks.span,
      "code_eval.aws_lambda.original_error",
    );
    expectSpanAttributes({
      "langfuse.code_eval.error.code": "LAMBDA_CONCURRENCY_LIMIT",
      "langfuse.code_eval.error.retryable": true,
    });
    expectSpanAttributes({
      "langfuse.code_eval.aws_error.name": "TooManyRequestsException",
      "langfuse.code_eval.aws_error.code": "TooManyRequests",
      "aws.request_id": "request-2",
      "aws.http_status_code": 429,
      "aws.sdk.attempts": 3,
      "aws.sdk.total_retry_delay_ms": 25,
    });
  });

  it("records dispatch context and error code for preflight limit failures", async () => {
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send: vi.fn() } as any,
    });

    await expect(
      dispatcher.dispatch({
        ...baseInput,
        code: { source: "a".repeat(256 * 1024 + 1) },
      }),
    ).rejects.toMatchObject({
      code: "SOURCE_TOO_LARGE",
      retryable: false,
    });

    expectSpanAttributes({
      "eval.dispatcher.name": "aws-lambda",
      "eval.job_execution.id": "job-1",
      "eval.runner.language": "TYPESCRIPT",
      "eval.template.id": "evaluator-1",
      "langfuse.org.id": "org-1",
      "langfuse.project.id": "project-1",
    });
    expectSpanAttributes({
      "langfuse.code_eval.error.code": "SOURCE_TOO_LARGE",
      "langfuse.code_eval.error.retryable": false,
    });
  });

  it("records the original Lambda FunctionError before throwing the derived user-facing error", async () => {
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: {
        send: vi.fn().mockResolvedValue({
          StatusCode: 200,
          FunctionError: "Handled",
          Payload: Buffer.from(
            JSON.stringify({
              errorMessage: "x is not defined",
              errorType: "ReferenceError",
              stackTrace: ["at evaluate (index.js:1:1)"],
            }),
          ),
          $metadata: {
            requestId: "request-3",
            httpStatusCode: 200,
            attempts: 1,
            totalRetryDelay: 0,
          },
        }),
      } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
      code: "USER_CODE_ERROR",
      message: "ReferenceError: x is not defined",
      retryable: false,
    });

    const tracedError = mocks.traceException.mock.calls[0][0];
    expect(tracedError).toMatchObject({
      name: "ReferenceError",
      message: "x is not defined",
      stack: "at evaluate (index.js:1:1)",
    });
    expect(mocks.traceException).toHaveBeenCalledWith(
      tracedError,
      mocks.span,
      "code_eval.aws_lambda.function_error",
    );
    expectSpanAttributes({
      "langfuse.code_eval.error.code": "USER_CODE_ERROR",
      "langfuse.code_eval.error.retryable": false,
    });
    expectSpanAttributes({
      "langfuse.code_eval.lambda.status_code": 200,
      "langfuse.code_eval.lambda.function_error": "Handled",
      "aws.request_id": "request-3",
    });
  });
});
