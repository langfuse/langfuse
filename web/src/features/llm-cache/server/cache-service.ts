import { redis } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

const CACHE_PREFIX = "sketrace:llm-cache:";
const INDEX_PREFIX = "sketrace:llm-cache-index:";

function getCacheSize(): number {
  return Number(env.SKETRACE_CACHE_SIZE ?? 20);
}

/**
 * Get a cached LLM response by content hash.
 * Returns null on cache miss.
 */
export async function getCachedResponse(params: {
  projectId: string;
  contentHash: string;
}): Promise<string | null> {
  if (!redis) return null;

  const { projectId, contentHash } = params;
  const key = `${CACHE_PREFIX}${projectId}:${contentHash}`;

  const cached = await redis.get(key);
  if (cached) {
    // Update access time in sorted set (LRU)
    await redis.zadd(
      `${INDEX_PREFIX}${projectId}`,
      Date.now(),
      contentHash,
    );
  }
  return cached;
}

/**
 * Store an LLM response in cache. Evicts oldest entry if cache is full.
 */
export async function setCachedResponse(params: {
  projectId: string;
  contentHash: string;
  response: string;
}): Promise<void> {
  if (!redis) return;

  const { projectId, contentHash, response } = params;
  const key = `${CACHE_PREFIX}${projectId}:${contentHash}`;
  const indexKey = `${INDEX_PREFIX}${projectId}`;
  const maxSize = getCacheSize();

  // Store the response
  await redis.set(key, response);

  // Add to sorted set with current timestamp
  await redis.zadd(indexKey, Date.now(), contentHash);

  // Evict oldest entries if over limit
  const count = await redis.zcard(indexKey);
  if (count > maxSize) {
    const toRemove = await redis.zrange(indexKey, 0, count - maxSize - 1);
    if (toRemove.length > 0) {
      const pipeline = redis.pipeline();
      for (const hash of toRemove) {
        pipeline.del(`${CACHE_PREFIX}${projectId}:${hash}`);
      }
      pipeline.zremrangebyrank(indexKey, 0, count - maxSize - 1);
      await pipeline.exec();
    }
  }
}

/**
 * List all cached entries for a project.
 * Returns content hashes with their last access timestamps.
 */
export async function listCachedEntries(params: {
  projectId: string;
}): Promise<Array<{ hash: string; lastAccess: number }>> {
  if (!redis) return [];

  const indexKey = `${INDEX_PREFIX}${params.projectId}`;
  const entries = await redis.zrevrangebyscore(
    indexKey,
    "+inf",
    "-inf",
    "WITHSCORES",
  );

  const result: Array<{ hash: string; lastAccess: number }> = [];
  for (let i = 0; i < entries.length; i += 2) {
    result.push({
      hash: entries[i]!,
      lastAccess: Number(entries[i + 1]),
    });
  }
  return result;
}

/**
 * Clear all cached entries for a project.
 */
export async function clearCache(params: {
  projectId: string;
}): Promise<number> {
  if (!redis) return 0;

  const { projectId } = params;
  const indexKey = `${INDEX_PREFIX}${projectId}`;
  const entries = await redis.zrange(indexKey, 0, -1);

  if (entries.length > 0) {
    const pipeline = redis.pipeline();
    for (const hash of entries) {
      pipeline.del(`${CACHE_PREFIX}${projectId}:${hash}`);
    }
    pipeline.del(indexKey);
    await pipeline.exec();
  }

  return entries.length;
}

/**
 * Delete a single cached entry.
 */
export async function deleteCachedEntry(params: {
  projectId: string;
  contentHash: string;
}): Promise<boolean> {
  if (!redis) return false;

  const { projectId, contentHash } = params;
  const deleted = await redis.del(
    `${CACHE_PREFIX}${projectId}:${contentHash}`,
  );
  await redis.zrem(`${INDEX_PREFIX}${projectId}`, contentHash);
  return deleted > 0;
}
