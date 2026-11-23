import type { FilterState } from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { TopicCostEstimateView } from "./TopicCostEstimateView";

type TopicCostEstimateProps = {
  projectId: string;
  filter: FilterState;
  facetIds: string[];
  samplingPercent: number;
  /** Finished matching traces a day, before sampling. */
  dailyTraces: number | null;
  /** Traces the first backfill would summarize, up to its limit. */
  backfillTraces: number | null;
  source: "setup" | "new_map";
};

/** Starts a background cost estimate and follows it until its result. */
export function TopicCostEstimate({
  projectId,
  filter,
  facetIds,
  samplingPercent,
  dailyTraces,
  backfillTraces,
  source,
}: TopicCostEstimateProps) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const input = { projectId, filter, facetIds };
  const estimate = api.topics.costEstimate.useQuery(input, {
    enabled: facetIds.length > 0,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 2000 : false,
  });
  const start = api.topics.startCostEstimate.useMutation({
    onSuccess: () => utils.topics.costEstimate.invalidate(input),
  });
  // Null once the record expired, so the card offers a new estimate.
  const current = estimate.data ?? null;
  return (
    <TopicCostEstimateView
      estimate={current}
      samplingPercent={samplingPercent}
      dailyTraces={dailyTraces}
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
