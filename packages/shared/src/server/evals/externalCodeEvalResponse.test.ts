import type { Span } from "@opentelemetry/api";
import { describe, expect, it, vi } from "vitest";
import {
  CODE_EVAL_DISPATCH_RESULT_MAX_BYTES,
  CodeEvalDispatcherErrorCodes,
} from "./codeEvalDispatcherTypes";
import { readExternalCodeEvalResponse } from "./externalCodeEvalResponse";

describe("readExternalCodeEvalResponse", () => {
  it("stops reading and records the size when a streamed payload exceeds the limit", async () => {
    const cancelBody = vi.fn();
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(CODE_EVAL_DISPATCH_RESULT_MAX_BYTES));
        controller.enqueue(new Uint8Array(1));
      },
      cancel: cancelBody,
    });
    const setAttribute = vi.fn();
    const span = { setAttribute } as unknown as Span;

    await expect(
      readExternalCodeEvalResponse(new Response(responseBody), span),
    ).rejects.toMatchObject({
      code: CodeEvalDispatcherErrorCodes.RESULT_TOO_LARGE,
      retryable: false,
    });
    expect(setAttribute).toHaveBeenCalledWith(
      "langfuse.code_eval.external.response_payload.bytes",
      CODE_EVAL_DISPATCH_RESULT_MAX_BYTES + 1,
    );
    expect(cancelBody).toHaveBeenCalledOnce();
  });
});
