import {
  AGENT_LIMITS,
  type AgentCountActivityResult,
} from "../../features/agents/api";
import { InvalidRequestError } from "../../errors/InvalidRequestError";

export type AgentActivityWindow = {
  from: Date;
  to: Date;
  bucketCount?: number;
};
export type AgentActivityBucketRow = {
  bucket_index: string | number;
  count: string | number;
};

export function agentActivityLayout(input: AgentActivityWindow) {
  const duration = input.to.getTime() - input.from.getTime();
  const bucketCount = input.bucketCount ?? AGENT_LIMITS.activityBuckets;
  if (
    !Number.isFinite(input.from.getTime()) ||
    !Number.isFinite(input.to.getTime()) ||
    duration <= 0 ||
    duration > AGENT_LIMITS.maxWindowDays * 86_400_000 ||
    !Number.isInteger(bucketCount) ||
    bucketCount < 1 ||
    bucketCount > AGENT_LIMITS.maxActivityBuckets
  )
    throw new InvalidRequestError(
      "Select a bounded activity window and up to 100 buckets.",
    );
  const bucketMs = Math.max(1, Math.ceil(duration / bucketCount));
  return { bucketMs, length: Math.ceil(duration / bucketMs) };
}

/** Empty buckets are meaningful only after a successful read or a proven empty cohort. */
export function buildAgentCountActivityResult(
  input: AgentActivityWindow,
  rows: AgentActivityBucketRow[],
): AgentCountActivityResult {
  const { bucketMs, length } = agentActivityLayout(input);
  const buckets = Array.from({ length }, (_, index) => ({
    timestamp: new Date(input.from.getTime() + index * bucketMs),
    count: 0,
  }));
  for (const row of rows) {
    const index = Number(row.bucket_index);
    const count = Number(row.count);
    const bucket = buckets[index];
    if (
      !Number.isInteger(index) ||
      !bucket ||
      !Number.isFinite(count) ||
      count < 0
    )
      throw new Error("Invalid agent activity bucket.");
    bucket.count = count;
  }
  return { from: input.from, to: input.to, bucketMs, buckets };
}
