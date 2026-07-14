import type { Span } from "@opentelemetry/api";
import { assertDispatchResultWithinByteLimit } from "./codeEvalDispatcherTypes";

export async function readExternalCodeEvalResponse(
  response: Response,
  span: Span,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    span.setAttribute("langfuse.code_eval.external.response_payload.bytes", 0);
    return "";
  }

  const chunks: Uint8Array[] = [];
  let responseBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      responseBytes += value.byteLength;
      try {
        assertDispatchResultWithinByteLimit(responseBytes);
      } catch (error) {
        span.setAttribute(
          "langfuse.code_eval.external.response_payload.bytes",
          responseBytes,
        );
        await reader.cancel().catch(() => undefined);
        throw error;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  span.setAttribute(
    "langfuse.code_eval.external.response_payload.bytes",
    responseBytes,
  );
  return new TextDecoder().decode(Buffer.concat(chunks));
}
