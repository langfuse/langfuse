import {
  AGENT_LIMITS,
  type AgentActivityBucket,
} from "@langfuse/shared/agents";
import { prepareSparkline } from "@/src/components/design-system/charts/SparklineChart/prepareSparkline";

type AgentActivityData = {
  from: Date;
  to: Date;
  bucketMs: number;
  buckets: AgentActivityBucket[];
};

export type AgentActivityState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; data: AgentActivityData };

export function toAgentActivityState(query: {
  isPending: boolean;
  isError: boolean;
  data: AgentActivityData | undefined;
}): AgentActivityState {
  if (query.isError) return { status: "error" };
  if (query.isPending) return { status: "loading" };
  if (query.data) return { status: "success", data: query.data };
  return { status: "error" };
}

/** Complete only the bucket axis. A missing measurement remains unknown. */
export function prepareAgentActivity(data: AgentActivityData) {
  const fromMs = data.from.getTime();
  const toMs = data.to.getTime();
  const validWindow =
    Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs < toMs;
  const validStep = Number.isFinite(data.bucketMs) && data.bucketMs > 0;
  const bucketCount =
    validWindow && validStep ? Math.ceil((toMs - fromMs) / data.bucketMs) : 0;
  const values: (number | null)[] = [];
  if (bucketCount > 0 && bucketCount <= AGENT_LIMITS.maxActivityBuckets) {
    const byTime = new Map(
      data.buckets.map((bucket) => [bucket.timestamp.getTime(), bucket.count]),
    );
    for (let index = 0; index < bucketCount; index++) {
      const value = byTime.get(fromMs + index * data.bucketMs);
      values.push(
        typeof value === "number" && Number.isFinite(value) && value >= 0
          ? value
          : null,
      );
    }
  }
  const complete = values.length > 0 && values.every((value) => value !== null);
  return {
    values,
    total: complete
      ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null,
    plot: prepareSparkline(values),
  };
}

/** A partial final bucket cannot expand the table past the selected period. */
export function selectAgentActivityRange(
  selection: { fromMs: number; toMs: number },
  window: Pick<AgentActivityData, "from" | "to">,
) {
  const from = Math.max(selection.fromMs, window.from.getTime());
  const to = Math.min(selection.toMs, window.to.getTime());
  return Number.isFinite(from) && Number.isFinite(to) && from < to
    ? { from: new Date(from), to: new Date(to) }
    : null;
}
