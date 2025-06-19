import { createHash } from "crypto";

/**
 * Utility function to compute a consistent hash for a given key and map it to a shard index
 * @param key - The key to hash
 * @param shardCount - The number of shards to distribute across
 * @returns A shard index between 0 and shardCount-1
 */
export function getShardIndex(key: string, shardCount: number): number {
  if (shardCount <= 1) return 0;

  // Create a consistent hash using SHA-256
  const hash = createHash("sha256").update(key).digest("hex");

  // Convert first 8 characters of hex to integer
  const hashInt = parseInt(hash.substring(0, 8), 16);

  // Map to shard index
  return hashInt % shardCount;
}
