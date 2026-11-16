import {
  classifyEvaluatorLlmError,
  getCurrentSpan,
  getLLMRetryAfterMs,
  LLMConnectionCooldownError,
  logger,
  recordIncrement,
  redis,
} from "@langfuse/shared/src/server";

const DEFAULT_COOLDOWN_MS = 60_000;
const MIN_COOLDOWN_MS = 5_000;
const MAX_COOLDOWN_MS = 300_000;
const COOLDOWN_METRIC = "langfuse.llm.connection_cooldown";
const REDIS_DEADLINE_MS = 1_000;

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
    if (isModelRateLimit(error)) await startCooldown(key, error);
    throw error;
  }
}

/**
 * How long a rate-limited eval job waits before calling the model again: the
 * remaining cooldown it hit, the cooldown its own 429 starts, or otherwise the
 * provider's retry-after.
 */
export function getLLMRetryDelayMs(error: unknown): number | undefined {
  const retryAfterMs = getLLMRetryAfterMs(error);
  if (error instanceof LLMConnectionCooldownError || !isModelRateLimit(error)) {
    return retryAfterMs;
  }
  return getCooldownMs(retryAfterMs);
}

/**
 * Only a 429 about the model's rate state pauses other calls. A billing 429
 * pauses its evaluator instead, and "Request too large" rejects this one input.
 */
function isModelRateLimit(error: unknown): boolean {
  const llmError = classifyEvaluatorLlmError(error);
  return (
    llmError?.statusCode === 429 &&
    llmError.blockReason === null &&
    !/request too large/i.test(llmError.message)
  );
}

async function getRemainingCooldownMs(key: string): Promise<number> {
  // ioredis queues commands while disconnected, so an outage would stall the
  // call instead of failing open.
  if (redis?.status !== "ready") return 0;
  try {
    // PTTL is negative when the key does not exist.
    return Math.max(0, await withRedisDeadline(redis.pttl(key)));
  } catch (error) {
    logger.warn("Failed to read LLM connection cooldown", { key, error });
    recordIncrement(COOLDOWN_METRIC, 1, { outcome: "redis_error" });
    return 0;
  }
}

async function startCooldown(key: string, rateLimitError: unknown) {
  if (redis?.status !== "ready") return;
  const cooldownMs = getCooldownMs(getLLMRetryAfterMs(rateLimitError));
  try {
    // NX: later 429s inside the window must not extend it.
    const result = await withRedisDeadline(
      redis.set(key, "1", "PX", cooldownMs, "NX"),
    );
    if (result === "OK") {
      recordIncrement(COOLDOWN_METRIC, 1, { outcome: "set" });
    }
  } catch (error) {
    logger.warn("Failed to start LLM connection cooldown", { key, error });
    recordIncrement(COOLDOWN_METRIC, 1, { outcome: "redis_error" });
  }
}

function getCooldownMs(retryAfterMs: number | undefined): number {
  return Math.min(
    MAX_COOLDOWN_MS,
    Math.max(MIN_COOLDOWN_MS, retryAfterMs ?? DEFAULT_COOLDOWN_MS),
  );
}

// A command sent just before a disconnect waits for the reconnect, so the
// status check alone does not keep an outage from holding the call.
async function withRedisDeadline<T>(command: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("LLM connection cooldown Redis call timed out")),
      REDIS_DEADLINE_MS,
    );
  });
  try {
    return await Promise.race([command, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
