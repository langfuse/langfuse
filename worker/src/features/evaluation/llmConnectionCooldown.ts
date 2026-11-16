import {
  classifyEvaluatorLlmError,
  getCurrentSpan,
  getLLMErrorInfo,
  LLMConnectionCooldownError,
  logger,
  recordIncrement,
  redis,
} from "@langfuse/shared/src/server";

const DEFAULT_COOLDOWN_MS = 60_000;
const MIN_COOLDOWN_MS = 5_000;
const MAX_COOLDOWN_MS = 300_000;
const COOLDOWN_METRIC = "langfuse.llm.connection_cooldown";

/**
 * Runs an LLM call unless its connection and model are cooling down after a
 * provider 429. Providers rate-limit per model, so other models on the same
 * connection keep running. During a cooldown it throws
 * LLMConnectionCooldownError without calling the provider; a provider 429
 * starts one for every worker. Unless Redis is ready the call always runs.
 */
export async function withLLMConnectionCooldown<T>(
  target: { llmApiKeyId: string; model: string },
  call: () => Promise<T>,
): Promise<T> {
  const key = `llm-connection-cooldown:${target.llmApiKeyId}:${target.model}`;

  const remainingMs = await getRemainingCooldownMs(key);
  if (remainingMs > 0) {
    recordIncrement(COOLDOWN_METRIC, 1, { outcome: "hit" });
    getCurrentSpan()?.setAttributes({
      "eval.llm.cooldown.hit": true,
      "eval.llm.cooldown.remaining_ms": remainingMs,
    });
    throw new LLMConnectionCooldownError(remainingMs);
  }

  try {
    return await call();
  } catch (error) {
    const llmError = classifyEvaluatorLlmError(error);
    // A 429 with a block reason (e.g. exhausted billing) pauses the evaluator
    // instead, so it must not hold back the connection's other evaluators.
    if (llmError?.statusCode === 429 && llmError.blockReason === null) {
      await startCooldown(key, error);
    }
    throw error;
  }
}

async function getRemainingCooldownMs(key: string): Promise<number> {
  // ioredis queues commands while disconnected, so an outage would stall the
  // call instead of failing open.
  if (redis?.status !== "ready") return 0;
  try {
    // PTTL is negative when the key does not exist.
    return Math.max(0, await redis.pttl(key));
  } catch (error) {
    logger.warn("Failed to read LLM connection cooldown", { key, error });
    recordIncrement(COOLDOWN_METRIC, 1, { outcome: "redis_error" });
    return 0;
  }
}

async function startCooldown(key: string, rateLimitError: unknown) {
  if (redis?.status !== "ready") return;
  const retryAfterMs = getRetryAfterMs(
    getLLMErrorInfo(rateLimitError)?.providerError?.responseHeaders,
  );
  const cooldownMs = Math.min(
    MAX_COOLDOWN_MS,
    Math.max(MIN_COOLDOWN_MS, retryAfterMs ?? DEFAULT_COOLDOWN_MS),
  );
  try {
    // NX: later 429s inside the window must not extend it.
    if ((await redis.set(key, "1", "PX", cooldownMs, "NX")) === "OK") {
      recordIncrement(COOLDOWN_METRIC, 1, { outcome: "set" });
    }
  } catch (error) {
    logger.warn("Failed to start LLM connection cooldown", { key, error });
    recordIncrement(COOLDOWN_METRIC, 1, { outcome: "redis_error" });
  }
}

function getRetryAfterMs(
  headers: Record<string, string> | undefined,
): number | undefined {
  const retryAfterMs = Number.parseFloat(headers?.["retry-after-ms"] ?? "");
  if (Number.isFinite(retryAfterMs)) return retryAfterMs;
  const retryAfterSeconds = Number.parseFloat(headers?.["retry-after"] ?? "");
  if (Number.isFinite(retryAfterSeconds)) return retryAfterSeconds * 1000;
  return undefined;
}
