import { createHash } from "node:crypto";
import { getShardIndex } from "@langfuse/shared/src/server";
import { env } from "../../env";

export function getTraceBatchReadinessKeys(shard: number) {
  const tag = `{trace-batch:${shard}}`;
  return { due: `${tag}:due`, state: `${tag}:state` };
}

export function getTraceBatchShard(member: string): number {
  return getShardIndex(member, env.LANGFUSE_TRACE_BATCH_SHARD_COUNT);
}

// Redis owns the clock. Include the next bucket so a boundary crossed between
// TIME and EVAL still writes into the correct bucket without a retry.
export function getTraceBatchFirstKeys(shard: number, now: number) {
  const ttl = env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS;
  const width = Math.min(3_600_000, ttl);
  const firstBucket = Math.floor((now - ttl) / width);
  const lastBucket = Math.floor(now / width) + 1;
  return {
    width,
    firstBucket,
    keys: Array.from(
      { length: lastBucket - firstBucket + 1 },
      (_, index) => `{trace-batch:${shard}}:first:${firstBucket + index}`,
    ),
  };
}

// A fixed 128-bit identity keeps arbitrary project/trace identifiers out of the
// retained map. Due/state keep the full identifiers for dispatch.
export function getTraceBatchFirstMember(member: string): Buffer {
  return createHash("sha256").update(member).digest().subarray(0, 16);
}
