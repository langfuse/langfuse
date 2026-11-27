import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
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
  const { region } = useLangfuseCloudRegion();
  const showUsage = region !== undefined;
  if (!modelPrice)
    return <TopicCostEstimateView {...props} showUsage={showUsage} />;
  const { estimate } = props;
  const modelName =
    estimate && !estimate.prices.summaryPriced
      ? estimate.inputs.summaryModel
      : estimate?.inputs.embeddingModel;
  return (
    <UpsertModelFormDialogController
      action="create"
      owner={{ scope: "project", projectId: modelPrice.projectId }}
      prefilledModelData={{ modelName: modelName ?? undefined }}
      onCreated={modelPrice.onCreated}
    >
      {({ openDialog }) => (
        <TopicCostEstimateView
          {...props}
          showUsage={showUsage}
          onAddModelPrice={openDialog}
        />
      )}
    </UpsertModelFormDialogController>
  );
}
