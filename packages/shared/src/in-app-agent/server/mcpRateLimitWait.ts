import { logger } from "../../server";
import { InAppAgentRateLimitErrorResponseSchema } from "../schema";

/**
 * Total time a single MCP operation may spend waiting out `rate_limited`
 * responses. Sized so a full Hobby `public-api` window (`retryAfterSeconds: 60`)
 * can still be waited out within one operation.
 */
export const IN_APP_AGENT_MCP_RATE_LIMIT_WAIT_BUDGET_MS = 60_000;

type McpRateLimitError = {
  retryAfterSeconds: number;
};

/**
 * Recognizes the public API `rate_limited` payload wherever the MCP transport
 * surfaces it: as a structured value, as a thrown `Error`, or embedded as JSON
 * in an error string (`Failed to initialize Langfuse MCP: ...`).
 */
export function parseMcpRateLimitError(
  error: unknown,
): McpRateLimitError | null {
  const parsed = InAppAgentRateLimitErrorResponseSchema.safeParse(error);

  if (parsed.success) {
    return { retryAfterSeconds: parsed.data.details.retryAfterSeconds };
  }

  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : null;

  return message === null ? null : parseEmbeddedRateLimitError(message);
}

function parseEmbeddedRateLimitError(message: string) {
  const endIndex = message.lastIndexOf("}");
  let startIndex = message.indexOf("{");

  while (startIndex !== -1 && startIndex < endIndex) {
    try {
      const parsed = InAppAgentRateLimitErrorResponseSchema.safeParse(
        JSON.parse(message.slice(startIndex, endIndex + 1)),
      );

      if (parsed.success) {
        return {
          retryAfterSeconds: parsed.data.details.retryAfterSeconds,
        };
      }
    } catch {
      // The transport prefixes JSON with error context, so try the next object.
    }

    startIndex = message.indexOf("{", startIndex + 1);
  }

  return null;
}

/**
 * Retries a single MCP operation while the public API answers `rate_limited`,
 * sleeping exactly as long as the response asks for. The server escalates
 * `retryAfterSeconds` as its window empties, so there is no local backoff
 * ladder. A wait longer than the remaining budget fails immediately instead of
 * sleeping and hoping.
 */
export async function withMcpRateLimitWait<T>(params: {
  fn: () => Promise<T>;
  signal?: AbortSignal;
  budgetMs?: number;
  logContext: Record<string, unknown>;
}): Promise<T> {
  let remainingBudgetMs =
    params.budgetMs ?? IN_APP_AGENT_MCP_RATE_LIMIT_WAIT_BUDGET_MS;

  for (;;) {
    try {
      return await params.fn();
    } catch (error: unknown) {
      const rateLimit = parseMcpRateLimitError(error);

      if (!rateLimit) {
        throw error;
      }

      const waitMs = rateLimit.retryAfterSeconds * 1_000;

      if (waitMs > remainingBudgetMs) {
        throw error;
      }

      logger.warn("Waiting out in-app agent MCP rate limit", {
        ...params.logContext,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
        remainingBudgetMs,
      });

      await sleep(waitMs, params.signal);
      remainingBudgetMs -= waitMs;
    }
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason);
    };

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
