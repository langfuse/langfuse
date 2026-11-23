import type { FilterState } from "@langfuse/shared";
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
  return (
    <TopicCostEstimateView
      estimate={current}
      samplingPercent={samplingPercent}
      backfillTraces={backfillTraces}
      modelSettingsHref={`/project/${projectId}/settings/models`}
      starting={start.isPending}
      disabled={facetIds.length === 0}
      error={start.error?.message ?? null}
      onStart={() => {
        capture("topics:cost_estimate_started", { source });
        start.mutate(input);
      }}
    />
  );
}
