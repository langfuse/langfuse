import type { FilterState } from "@langfuse/shared";
import { TOPICS_COST_ESTIMATE_MAX_FACETS } from "@langfuse/shared/topics";
import { UpsertModelFormDialogController } from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialogController";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import {
  TopicCostEstimateView,
  type TopicEstimateVolume,
} from "./TopicCostEstimateView";
import { useTopicsCapture } from "./useTopicsCapture";

type TopicCostEstimateProps = TopicEstimateVolume & {
  projectId: string;
  filter: FilterState;
  facetIds: string[];
  source: "setup" | "new_map" | "snapshot";
};

/** Starts a background cost estimate and follows it until its result. */
export function TopicCostEstimate(props: TopicCostEstimateProps) {
  if (props.facetIds.length > TOPICS_COST_ESTIMATE_MAX_FACETS)
    return (
      <p className="text-muted-foreground text-sm">
        Cost estimates support up to {TOPICS_COST_ESTIMATE_MAX_FACETS} selected
        questions.
      </p>
    );
  return <TopicCostEstimateQuery {...props} />;
}

function TopicCostEstimateQuery({
  projectId,
  filter,
  facetIds,
  source,
  ...volume
}: TopicCostEstimateProps) {
  const capture = useTopicsCapture();
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
  const canAddModelPrice = useHasProjectAccess({
    projectId,
    scope: "models:CUD",
  });
  // The summary model first: it carries nearly all of the cost.
  const unpricedModel =
    current && !current.prices.summaryPriced
      ? current.inputs.summaryModel
      : (current?.inputs.embeddingModel ?? undefined);
  return (
    <UpsertModelFormDialogController
      action="create"
      projectId={projectId}
      prefilledModelData={{ modelName: unpricedModel }}
      // Stay in the dialog; prices apply on read, so the card then shows the cost.
      onCreated={() => utils.topics.costEstimate.invalidate(input)}
    >
      {({ openDialog }) => (
        <TopicCostEstimateView
          estimate={current}
          {...volume}
          canAddModelPrice={canAddModelPrice}
          onAddModelPrice={openDialog}
          // Also while the started estimate loads, so a second click cannot slip in.
          starting={start.isPending || estimate.isRefetching}
          disabled={facetIds.length === 0}
          error={start.error?.message ?? null}
          onStart={() => {
            capture("topics:cost_estimate_started", { source });
            start.mutate(input);
          }}
        />
      )}
    </UpsertModelFormDialogController>
  );
}
