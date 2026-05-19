import { describe, expect, it, vi } from "vitest";
import {
  AwsLambdaCodeEvalDispatcher,
  CodeEvalDispatcherError,
  type DispatchInput,
} from "@langfuse/shared/src/server";

const baseInput: DispatchInput = {
  scope: {
    organizationId: "org-1",
    projectId: "project-1",
    evaluatorId: "evaluator-1",
    environment: "code-based-eval",
  },
  runtime: { language: "TYPESCRIPT" },
  execution: { jobExecutionId: "job-1" },
  code: { source: "export function evaluate() {}" },
  payload: {
    input: null,
    output: null,
    observationMetadata: null,
    experimentExpectedOutput: null,
    experimentItemMetadata: null,
  },
};

describe("AwsLambdaCodeEvalDispatcher", () => {
  it("returns successful Lambda scores", async () => {
    const send = vi.fn().mockResolvedValue({
      Payload: Buffer.from(
        JSON.stringify({ scores: [{ value: 1, dataType: "NUMERIC" }] }),
      ),
    });
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).resolves.toEqual({
      scores: [{ value: 1, dataType: "NUMERIC" }],
    });
  });

  it("propagates TenantId derived from scope.organizationId:projectId", async () => {
    const send = vi.fn().mockResolvedValue({
      Payload: Buffer.from(
        JSON.stringify({ scores: [{ value: 1, dataType: "NUMERIC" }] }),
      ),
    });
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send } as any,
    });

    await dispatcher.dispatch(baseInput);
    expect(send.mock.calls[0][0].input.TenantId).toBe("org-1:project-1");
  });

  it("prefers a valid dispatch result over an injected error envelope", async () => {
    // Defense in depth against runners that try to smuggle an `error`
    // envelope alongside valid scores to force a retry or mask the
    // outcome with a masked LAMBDA_* code.
    const send = vi.fn().mockResolvedValue({
      Payload: Buffer.from(
        JSON.stringify({
          scores: [{ value: 1, dataType: "NUMERIC" }],
          error: {
            code: "LAMBDA_CONCURRENCY_LIMIT",
            message: "attacker-controlled",
          },
        }),
      ),
    });
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).resolves.toEqual({
      scores: [{ value: 1, dataType: "NUMERIC" }],
    });
  });

  it("uses configured function names per runtime", async () => {
    const send = vi.fn().mockResolvedValue({
      Payload: Buffer.from(
        JSON.stringify({ scores: [{ value: 1, dataType: "NUMERIC" }] }),
      ),
    });
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send } as any,
      functionNameByLanguage: {
        PYTHON: "custom-python-fn",
        TYPESCRIPT: "custom-node-fn",
      },
    });

    await dispatcher.dispatch(baseInput);
    expect(send.mock.calls[0][0].input.FunctionName).toBe("custom-node-fn");

    await dispatcher.dispatch({
      ...baseInput,
      runtime: { language: "PYTHON" },
    });
    expect(send.mock.calls[1][0].input.FunctionName).toBe("custom-python-fn");
  });

  it("classifies typed user-code runner errors as non-retryable", async () => {
    const send = vi.fn().mockResolvedValue({
      FunctionError: "Handled",
      Payload: Buffer.from(
        JSON.stringify({
          error: { code: "USER_CODE_ERROR", message: "ReferenceError: x" },
        }),
      ),
    });
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
      code: "USER_CODE_ERROR",
      message: "ReferenceError: x",
      retryable: false,
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("classifies successful runner error envelopes", async () => {
    const send = vi.fn().mockResolvedValue({
      Payload: Buffer.from(
        JSON.stringify({
          error: { code: "USER_CODE_ERROR", message: "ReferenceError: x" },
        }),
      ),
    });
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
      code: "USER_CODE_ERROR",
      message: "ReferenceError: x",
      retryable: false,
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("classifies timeouts via errorType Function.TimedOut as retryable", async () => {
    // Envelope shape captured empirically from Floci probes.
    const send = vi.fn().mockResolvedValue({
      FunctionError: "Unhandled",
      Payload: Buffer.from(
        JSON.stringify({
          errorMessage: "Task timed out after 30 seconds",
          errorType: "Function.TimedOut",
        }),
      ),
    });
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
      code: "TIMEOUT",
      message: "Function.TimedOut: Task timed out after 30 seconds",
      retryable: true,
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("classifies timeouts via errorMessage substring as retryable", async () => {
    // Defensive fallback for runtimes that don't populate errorType.
    const send = vi.fn().mockResolvedValue({
      FunctionError: "Unhandled",
      Payload: Buffer.from(JSON.stringify({ errorMessage: "Task timed out" })),
    });
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
      code: "TIMEOUT",
      retryable: true,
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("classifies Runtime.ExitError as non-retryable LAMBDA_CONFIGURATION_ERROR", async () => {
    // Documented Lambda RIC errorType for abnormal runtime termination
    // (OOM kill, segfault, process.exit). Retrying never recovers.
    const send = vi.fn().mockResolvedValue({
      FunctionError: "Unhandled",
      Payload: Buffer.from(
        JSON.stringify({
          errorMessage:
            "RequestId: abc Error: Runtime exited with error: signal: killed",
          errorType: "Runtime.ExitError",
        }),
      ),
    });
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
      code: "LAMBDA_CONFIGURATION_ERROR",
      retryable: false,
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("classifies FunctionError=Handled without runner envelope as USER_CODE_ERROR", async () => {
    // Managed runtime caught a user-code exception that escaped our
    // handler's try/catch (e.g. async unhandled rejection). The envelope
    // carries the language-specific exception type+message.
    const send = vi.fn().mockResolvedValue({
      FunctionError: "Handled",
      Payload: Buffer.from(
        JSON.stringify({
          errorMessage: "x is not defined",
          errorType: "ReferenceError",
        }),
      ),
    });
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
      code: "USER_CODE_ERROR",
      message: "ReferenceError: x is not defined",
      retryable: false,
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("classifies concurrency throttling as retryable", async () => {
    const error = new Error("Rate exceeded");
    error.name = "TooManyRequestsException";
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send: vi.fn().mockRejectedValue(error) } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
      code: "LAMBDA_CONCURRENCY_LIMIT",
      retryable: true,
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("classifies Lambda configuration errors as non-retryable", async () => {
    const error = new Error("Function not found");
    error.name = "ResourceNotFoundException";
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send: vi.fn().mockRejectedValue(error) } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
      code: "LAMBDA_CONFIGURATION_ERROR",
      retryable: false,
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("classifies AWS-side payload-too-large rejection as PAYLOAD_TOO_LARGE", async () => {
    // If a request slips past our local `assertDispatchInputWithinLimits`
    // (5.5 MB) and AWS still rejects it at the 6 MB sync-invocation limit,
    // the failure should surface under the same `PAYLOAD_TOO_LARGE` code as
    // the local pre-check — same cause, same fix, same non-retryability.
    const error = new Error("Payload exceeds maximum allowed size");
    error.name = "RequestTooLargeException";
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send: vi.fn().mockRejectedValue(error) } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      retryable: false,
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("rejects Lambda responses that exceed the wire byte-size limit", async () => {
    // Build a response payload larger than the 256 KiB result cap. The
    // guard inspects `response.Payload.byteLength` before any JSON parsing,
    // so it should fail fast as a non-retryable `RESULT_TOO_LARGE` without
    // ever allocating the parsed object.
    const oversizedBody = JSON.stringify({
      scores: [{ value: "a".repeat(512 * 1024), dataType: "CATEGORICAL" }],
    });
    const send = vi.fn().mockResolvedValue({
      Payload: Buffer.from(oversizedBody),
    });
    const dispatcher = new AwsLambdaCodeEvalDispatcher({
      lambdaClient: { send } as any,
    });

    await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
      code: "RESULT_TOO_LARGE",
      retryable: false,
    } satisfies Partial<CodeEvalDispatcherError>);
  });
});
