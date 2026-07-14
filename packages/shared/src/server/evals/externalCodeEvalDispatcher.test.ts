import { SpanKind } from "@opentelemetry/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalCodeEvalDispatcher } from "./externalCodeEvalDispatcher";
import {
  CODE_EVAL_SOURCE_MAX_BYTES,
  CodeEvalDispatcherErrorCodes,
  type DispatchInput,
} from "./codeEvalDispatcherTypes";

const mocks = vi.hoisted(() => {
  const span = {
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
  };

  return {
    span,
    instrumentAsync: vi.fn(async (_ctx, callback) => callback(span)),
    logger: {
      warn: vi.fn(),
    },
  };
});

vi.mock("../instrumentation", () => ({
  instrumentAsync: mocks.instrumentAsync,
}));

vi.mock("../logger", () => ({
  logger: mocks.logger,
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
      toolCalls: [],
    },
  },
};

function expectSpanAttributes(attributes: Record<string, unknown>): void {
  expect(mocks.span.setAttributes).toHaveBeenCalledWith(
    expect.objectContaining(attributes),
  );
}

describe("ExternalCodeEvalDispatcher", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("dispatch requests", () => {
    it("dispatches inside a dedicated trace with code evaluator context", async () => {
      const endpoint = "https://code-eval.example.com/evaluations";
      const responseBody = JSON.stringify({
        scores: [{ name: "quality", value: 1 }],
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(responseBody)),
      );
      const dispatcher = new ExternalCodeEvalDispatcher({ endpoint });

      await expect(dispatcher.dispatch(baseInput)).resolves.toEqual({
        scores: [{ name: "quality", value: 1 }],
      });

      expect(mocks.instrumentAsync).toHaveBeenCalledWith(
        {
          name: "code-eval.dispatch.external",
          spanKind: SpanKind.CLIENT,
          traceScope: "code-eval-dispatcher",
          startNewTrace: true,
        },
        expect.any(Function),
      );
      expect(fetch).toHaveBeenCalledWith(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(baseInput),
        redirect: "manual",
        signal: expect.any(AbortSignal),
      });
      expectSpanAttributes({
        "eval.dispatcher.name": "external",
        "eval.job_execution.id": "job-1",
        "eval.runner.language": "TYPESCRIPT",
        "eval.template.id": "evaluator-1",
        "langfuse.org.id": "org-1",
        "langfuse.project.id": "project-1",
      });
      expect(mocks.span.setAttribute).toHaveBeenCalledWith(
        "langfuse.code_eval.payload.bytes",
        Buffer.byteLength(JSON.stringify(baseInput), "utf8"),
      );
      expect(mocks.span.setAttribute).toHaveBeenCalledWith(
        "langfuse.code_eval.external.status_code",
        200,
      );
      expect(mocks.span.setAttribute).toHaveBeenCalledWith(
        "langfuse.code_eval.external.response_payload.bytes",
        Buffer.byteLength(responseBody, "utf8"),
      );
      expect(mocks.span.setAttribute).toHaveBeenCalledWith(
        "eval.score.count",
        1,
      );
    });

    it("records dispatch context and error code for preflight limit failures", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const dispatcher = new ExternalCodeEvalDispatcher({
        endpoint: "https://code-eval.example.com/evaluations",
      });

      await expect(
        dispatcher.dispatch({
          ...baseInput,
          code: { source: "a".repeat(CODE_EVAL_SOURCE_MAX_BYTES + 1) },
        }),
      ).rejects.toMatchObject({
        code: CodeEvalDispatcherErrorCodes.SOURCE_TOO_LARGE,
        retryable: false,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expectSpanAttributes({
        "eval.dispatcher.name": "external",
        "eval.job_execution.id": "job-1",
        "eval.runner.language": "TYPESCRIPT",
        "eval.template.id": "evaluator-1",
        "langfuse.org.id": "org-1",
        "langfuse.project.id": "project-1",
      });
      expectSpanAttributes({
        "langfuse.code_eval.error.code":
          CodeEvalDispatcherErrorCodes.SOURCE_TOO_LARGE,
        "langfuse.code_eval.error.retryable": false,
      });
      expect(mocks.logger.warn).not.toHaveBeenCalled();
    });
  });

  describe("timeout handling", () => {
    it("classifies response read failures as retryable invocation errors", async () => {
      const abortController = new AbortController();
      const timeoutSpy = vi
        .spyOn(AbortSignal, "timeout")
        .mockReturnValue(abortController.signal);

      let notifyBodyReadStarted: () => void;
      const bodyReadStarted = new Promise<void>((resolve) => {
        notifyBodyReadStarted = resolve;
      });
      const response = new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            notifyBodyReadStarted();
            return new Promise<void>((resolve) => {
              abortController.signal.addEventListener(
                "abort",
                () => {
                  controller.error(abortController.signal.reason);
                  resolve();
                },
                { once: true },
              );
            });
          },
        }),
      );

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      const dispatcher = new ExternalCodeEvalDispatcher({
        endpoint: "https://code-eval.example.com/evaluations",
      });

      const dispatchPromise = dispatcher.dispatch(baseInput);
      await bodyReadStarted;
      const cause = new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      );
      abortController.abort(cause);
      const error = await dispatchPromise.catch((error: unknown) =>
        Promise.resolve(error),
      );

      expect(timeoutSpy).toHaveBeenCalledWith(10_000);
      expect(fetch).toHaveBeenCalledWith(
        "https://code-eval.example.com/evaluations",
        expect.objectContaining({
          redirect: "manual",
          signal: abortController.signal,
        }),
      );
      expect(error).toMatchObject({
        code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
        message:
          "Failed to read external code eval response: The operation was aborted due to timeout",
        retryable: true,
        cause,
      });
    });

    it("classifies fetch timeouts as retryable", async () => {
      const abortController = new AbortController();
      const timeoutSpy = vi
        .spyOn(AbortSignal, "timeout")
        .mockReturnValue(abortController.signal);
      const cause = new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      );

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async () => {
          abortController.abort(cause);
          throw cause;
        }),
      );
      const dispatcher = new ExternalCodeEvalDispatcher({
        endpoint: "https://code-eval.example.com/evaluations",
      });

      const error = await dispatcher
        .dispatch(baseInput)
        .catch((error: unknown) => Promise.resolve(error));

      expect(timeoutSpy).toHaveBeenCalledWith(10_000);
      expect(error).toMatchObject({
        code: CodeEvalDispatcherErrorCodes.TIMEOUT,
        message: "External code eval request timed out after 10000ms",
        retryable: true,
        cause,
      });
    });
  });

  describe("response parsing", () => {
    it("classifies invalid JSON external responses as INVALID_RESULT", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("not valid JSON")),
      );
      const dispatcher = new ExternalCodeEvalDispatcher({
        endpoint: "https://code-eval.example.com/evaluations",
      });

      await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
        code: CodeEvalDispatcherErrorCodes.INVALID_RESULT,
        message: "External code eval returned invalid JSON",
        retryable: false,
        cause: expect.any(SyntaxError),
      });
    });

    it("includes a valid JSON response with an invalid result shape as returnedResult", async () => {
      const returnedResult = { scores: [] };
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(returnedResult))),
      );
      const dispatcher = new ExternalCodeEvalDispatcher({
        endpoint: "https://code-eval.example.com/evaluations",
      });

      await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
        code: CodeEvalDispatcherErrorCodes.INVALID_RESULT,
        retryable: false,
        returnedResult,
      });
    });

    it("prefers a valid dispatch result when the response also contains an error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              scores: [{ name: "quality", value: 1 }],
              error: {
                code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
                message: "attacker-controlled",
              },
            }),
          ),
        ),
      );
      const dispatcher = new ExternalCodeEvalDispatcher({
        endpoint: "https://code-eval.example.com/evaluations",
      });

      await expect(dispatcher.dispatch(baseInput)).resolves.toEqual({
        scores: [{ name: "quality", value: 1 }],
      });
    });

    it.each([
      [
        CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
        "External runner temporarily unavailable",
      ],
      [CodeEvalDispatcherErrorCodes.TIMEOUT, "Evaluator timed out"],
    ])(
      "classifies %s in a successful HTTP response as retryable",
      async (code, message) => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                error: { code, message },
              }),
            ),
          ),
        );
        const dispatcher = new ExternalCodeEvalDispatcher({
          endpoint: "https://code-eval.example.com/evaluations",
        });

        await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
          code,
          message,
          retryable: true,
        });
      },
    );
  });

  describe("error observability", () => {
    it("records and logs structured infrastructure errors", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response("Service unavailable", { status: 500 }),
          ),
      );
      const dispatcher = new ExternalCodeEvalDispatcher({
        endpoint: "https://code-eval.example.com/evaluations",
      });

      await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
        code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
        retryable: true,
      });
      expect(mocks.span.setAttributes).toHaveBeenCalledWith({
        "langfuse.code_eval.error.code":
          CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
        "langfuse.code_eval.error.retryable": true,
      });
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        "External code eval dispatcher failed: External code eval returned status 500",
        {
          code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
          retryable: true,
        },
      );
    });

    it("records user errors without warning", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                code: CodeEvalDispatcherErrorCodes.USER_CODE_ERROR,
                message: "Error: evaluator failed",
              },
            }),
          ),
        ),
      );
      const dispatcher = new ExternalCodeEvalDispatcher({
        endpoint: "https://code-eval.example.com/evaluations",
      });

      await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
        code: CodeEvalDispatcherErrorCodes.USER_CODE_ERROR,
        message: "Error: evaluator failed",
        retryable: false,
      });
      expect(mocks.span.setAttributes).toHaveBeenCalledWith({
        "langfuse.code_eval.error.code":
          CodeEvalDispatcherErrorCodes.USER_CODE_ERROR,
        "langfuse.code_eval.error.retryable": false,
      });
      expect(mocks.logger.warn).not.toHaveBeenCalled();
    });
  });

  describe("HTTP error responses", () => {
    it.each([409, 429, 500])(
      "classifies Lambda-equivalent HTTP status %i as a retryable external invocation error",
      async (status) => {
        const response = {
          ok: false,
          status,
        } as unknown as Response;
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
        const dispatcher = new ExternalCodeEvalDispatcher({
          endpoint: "https://code-eval.example.com/evaluations",
        });

        const error = await dispatcher
          .dispatch(baseInput)
          .catch((error: unknown) => Promise.resolve(error));

        expect(error).toMatchObject({
          code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
          message: `External code eval returned status ${status}`,
          retryable: true,
        });
      },
    );

    it.each([400, 408, 502, 503, 504])(
      "classifies other HTTP status %i as non-retryable",
      async (status) => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(
            new Response("Request failed", {
              status,
            }),
          ),
        );
        const dispatcher = new ExternalCodeEvalDispatcher({
          endpoint: "https://code-eval.example.com/evaluations",
        });

        await expect(dispatcher.dispatch(baseInput)).rejects.toMatchObject({
          code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
          message: `External code eval returned status ${status}`,
          retryable: false,
        });
      },
    );
  });

  describe("transport errors", () => {
    it("classifies fetch rejections as retryable invocation errors", async () => {
      const cause = new Error("socket hang up");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));
      const dispatcher = new ExternalCodeEvalDispatcher({
        endpoint: "https://code-eval.example.com/evaluations",
      });

      const error = await dispatcher
        .dispatch(baseInput)
        .catch((error: unknown) => Promise.resolve(error));

      expect(error).toMatchObject({
        code: CodeEvalDispatcherErrorCodes.EXTERNAL_INVOCATION_ERROR,
        message: "Failed to invoke external code eval: socket hang up",
        retryable: true,
        cause,
      });
    });
  });
});
