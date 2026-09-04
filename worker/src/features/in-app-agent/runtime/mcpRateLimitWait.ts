import { InAppAgentRateLimitErrorResponseSchema } from "@langfuse/shared/in-app-agent";
import { logger, recordIncrement } from "@langfuse/shared/src/server";

/** Total time a single MCP operation may spend waiting out rate limits. */
const IN_APP_AGENT_MCP_RATE_LIMIT_WAIT_BUDGET_MS = 60_000;

const MCP_RATE_LIMIT_WAIT_METRIC = "langfuse.in_app_agent.mcp_rate_limit_wait";

type McpRateLimitError = {
  retryAfterSeconds: number;
};

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
        return { retryAfterSeconds: parsed.data.details.retryAfterSeconds };
      }
    } catch {
      // The transport prefixes JSON with error context.
    }

    startIndex = message.indexOf("{", startIndex + 1);
  }

  return null;
}

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
      const operation = String(params.logContext.operation ?? "unknown");

      if (waitMs > remainingBudgetMs) {
        // The run fails from here on, so this is the tag that separates "we
        // absorbed a rate limit" from "a rate limit killed the turn".
        recordIncrement(MCP_RATE_LIMIT_WAIT_METRIC, 1, {
          outcome: "budget_exhausted",
          operation,
        });
        throw error;
      }

      recordIncrement(MCP_RATE_LIMIT_WAIT_METRIC, 1, {
        outcome: "waited",
        operation,
      });

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
