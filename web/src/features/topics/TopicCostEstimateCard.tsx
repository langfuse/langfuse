import { UpsertModelFormDialogController } from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialogController";
import {
  TopicCostEstimateView,
  type TopicEstimateControls,
  type TopicEstimateVolume,
} from "./TopicCostEstimateView";

export type TopicCostForecast = TopicEstimateControls & {
  modelPrice: { projectId: string; onCreated: () => void } | null;
};

/** Opens the price editor inside the card's containing dialog. */
export function TopicCostEstimateCard({
  modelPrice,
  ...props
}: TopicCostForecast & TopicEstimateVolume) {
  if (!modelPrice) return <TopicCostEstimateView {...props} />;
  const { estimate } = props;
  const modelName =
    estimate && !estimate.prices.summaryPriced
      ? estimate.inputs.summaryModel
      : estimate?.inputs.embeddingModel;
  return (
    <UpsertModelFormDialogController
      action="create"
      projectId={modelPrice.projectId}
      prefilledModelData={{ modelName: modelName ?? undefined }}
      onCreated={modelPrice.onCreated}
    >
      {({ openDialog }) => (
        <TopicCostEstimateView {...props} onAddModelPrice={openDialog} />
      )}
    </UpsertModelFormDialogController>
  );
}
