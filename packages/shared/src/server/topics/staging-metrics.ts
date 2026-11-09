import { recordGauge, recordIncrement } from "../instrumentation";
import { logger } from "../logger";
import { redis } from "../redis/redis";

const EXPIRY_INDEX = "topics:staging:expiry";
const INDEX_GRACE_MS = 86400_000;

/** The shared Redis client retries indefinitely; telemetry must not wait with it. */
async function withMetricsDeadline<T>(command: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      command,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Topics staging metrics timed out")),
          1000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Read the original Redis deadline; embedding updates preserve this TTL. */
export async function trackTopicStagingExpiry(key: string): Promise<void> {
  try {
    if (!redis) throw new Error("Topics staging metrics require Redis.");
    const expiresAt = (await withMetricsDeadline(
      redis.eval(
        `local ttl = redis.call('PTTL', KEYS[1])
       if ttl < 0 then return ttl end
       local now = redis.call('TIME')
       return now[1] * 1000 + math.floor(now[2] / 1000) + ttl`,
        1,
        key,
      ),
    )) as number;
    if (expiresAt < 0) return;
    // The payload and index occupy different Redis Cluster slots. Indexing is
    // best effort and must never reject an accepted paid result.
    await withMetricsDeadline(
      redis.eval(
        `redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
       local now = redis.call('TIME')
       local cutoff = now[1] * 1000 + math.floor(now[2] / 1000) - tonumber(ARGV[3])
       local stale = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', cutoff, 'LIMIT', 0, 1000)
       for _, member in ipairs(stale) do redis.call('ZREM', KEYS[1], member) end
       local last = redis.call('ZREVRANGE', KEYS[1], 0, 0, 'WITHSCORES')
       if last[2] then redis.call('PEXPIREAT', KEYS[1], tonumber(last[2]) + tonumber(ARGV[3])) end`,
        1,
        EXPIRY_INDEX,
        expiresAt,
        key,
        INDEX_GRACE_MS,
      ),
    );
  } catch {
    recordIncrement("langfuse.topics.staging_tracking_errors", 1, {
      operation: "track",
    });
    logger.warn("Topics staging expiry tracking failed");
  }
}

export async function forgetTopicStagingExpiry(key: string): Promise<void> {
  try {
    if (!redis) throw new Error("Topics staging metrics require Redis.");
    await withMetricsDeadline(redis.zrem(EXPIRY_INDEX, key));
  } catch {
    recordIncrement("langfuse.topics.staging_tracking_errors", 1, {
      operation: "release",
    });
    logger.warn("Topics staging expiry cleanup failed");
  }
}

/** Global snapshot: counts use max across reporters, remaining time min, counters sum. */
export async function emitTopicStagingMetrics(): Promise<void> {
  if (!redis) throw new Error("Topics staging metrics require Redis.");
  const [live, remainingMs, expired] = (await withMetricsDeadline(
    redis.eval(
      `local time = redis.call('TIME')
     local now = time[1] * 1000 + math.floor(time[2] / 1000)
     local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now, 'LIMIT', 0, 1000)
     for _, member in ipairs(expired) do redis.call('ZREM', KEYS[1], member) end
     local first = redis.call('ZRANGEBYSCORE', KEYS[1], '(' .. now, '+inf', 'WITHSCORES', 'LIMIT', 0, 1)
     local live = redis.call('ZCOUNT', KEYS[1], '(' .. now, '+inf')
     return {live, first[2] and tonumber(first[2]) - now or 0, #expired}`,
      1,
      EXPIRY_INDEX,
    ),
  )) as [number, number, number];
  recordGauge("langfuse.topics.staged_results", live, { unit: "records" });
  recordGauge("langfuse.topics.staged_expiry_remaining_ms", remainingMs, {
    unit: "milliseconds",
  });
  if (expired > 0) recordIncrement("langfuse.topics.staged_expired", expired);
}
