import { useEffect, useState } from "react";
import type { FilterState } from "@langfuse/shared";
import { TOPICS_COST_ESTIMATE_COOLDOWN_MS } from "@langfuse/shared/topics";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { TopicCostEstimateView } from "./TopicCostEstimateView";

type TopicCostEstimateProps = {
  projectId: string;
  filter: FilterState;
  facetIds: string[];
  samplingPercent: number;
  /** Traces the first backfill would summarize, after sampling and its limit. */
  backfillTraces: number | null;
  source: "setup" | "new_map";
};

/** Starts a background cost estimate and follows it until its result. */
export function TopicCostEstimate({
  projectId,
  filter,
  facetIds,
  samplingPercent,
  backfillTraces,
  source,
}: TopicCostEstimateProps) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const input = { projectId, filter, facetIds };
  const estimate = api.topics.costEstimate.useQuery(input, {
    enabled: facetIds.length > 0,
  });
  // While running, poll the record by key so the inputs are not resolved again.
  const runningKey =
    estimate.data?.status === "running" ? estimate.data.key : null;
  const progress = api.topics.costEstimateProgress.useQuery(
    { projectId, key: runningKey ?? "" },
    {
      enabled: runningKey !== null,
      refetchInterval: (query) =>
        query.state.data?.status === "running" ? 2000 : false,
    },
  );
  const start = api.topics.startCostEstimate.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.topics.costEstimate.invalidate(input),
        utils.topics.costEstimateProgress.invalidate(),
      ]),
  });
  // A null progress read means the record expired, so the card offers a new estimate.
  const current =
    runningKey !== null &&
    progress.isSuccess &&
    (progress.data === null || progress.data.runId === estimate.data?.runId)
      ? progress.data
      : (estimate.data ?? null);
  // The server reuses a finished estimate for the same inputs until the cooldown ends.
  const restartAt =
    current?.status === "done" && current.finishedAt !== null
      ? current.finishedAt + TOPICS_COST_ESTIMATE_COOLDOWN_MS
      : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (restartAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [restartAt]);
  const restartInMinutes =
    restartAt !== null && restartAt > now
      ? Math.ceil((restartAt - now) / 60_000)
      : null;
  return (
    <TopicCostEstimateView
      estimate={current}
      restartInMinutes={restartInMinutes}
      samplingPercent={samplingPercent}
      backfillTraces={backfillTraces}
      modelSettingsHref={`/project/${projectId}/settings/models`}
      // Also while the started estimate loads, so a second click cannot slip in.
      starting={start.isPending || estimate.isRefetching}
      disabled={facetIds.length === 0}
      error={start.error?.message ?? null}
      onStart={() => {
        capture("topics:cost_estimate_started", { source });
        start.mutate(input);
      }}
    />
  );
}
