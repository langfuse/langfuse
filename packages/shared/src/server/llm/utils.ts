import { z } from "zod";

import { decrypt } from "../../encryption";
import { LLMAdapter } from "./types";

const ExtraHeaderSchema = z.record(z.string(), z.string());

export const RUNTIME_TIMEOUT_ADAPTERS = new Set([
  LLMAdapter.VertexAI,
  LLMAdapter.GoogleAIStudio,
]);

export async function executeWithRuntimeTimeout<T>({
  enabled,
  timeoutMs,
  abortController,
  operation,
}: {
  enabled: boolean;
  timeoutMs: number;
  abortController?: AbortController;
  operation: () => Promise<T>;
}): Promise<T> {
  if (!enabled) {
    return operation();
  }

  const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          abortController?.abort(timeoutError);
          reject(timeoutError);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function decryptAndParseExtraHeaders(
  extraHeaders: string | null | undefined,
) {
  if (!extraHeaders) return;

  return ExtraHeaderSchema.parse(JSON.parse(decrypt(extraHeaders)));
}
