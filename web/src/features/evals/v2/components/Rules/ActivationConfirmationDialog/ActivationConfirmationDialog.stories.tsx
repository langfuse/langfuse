import { fn } from "storybook/test";
import preview from "../../../../../../../.storybook/preview";
import { ActivationConfirmationDialog } from "./ActivationConfirmationDialog";

const sharedArgs = {
  onOpenChange: fn(),
  onSamplingChange: fn(),
  onConfirm: fn(),
};

const confirmation = {
  open: true,
  isConfirming: false,
  title: "Activate evaluation rule?",
  description: "Estimate details",
  confirmLabel: "Activate rule",
  pendingAction: fn().mockResolvedValue(undefined),
};

const unavailableEstimate = {
  status: "idle" as const,
  sampling: null,
  estimates: [],
  unavailableEstimateCount: 1,
  matchingObservations: 715,
};

const estimatedCost = {
  status: "idle" as const,
  sampling: 0.77,
  estimates: [
    {
      evaluatorId: "conciseness",
      evaluatorName: "Conciseness Toi",
      matchingObservations: 715,
      sampling: 0.77,
      testRunCostUsd: 0.000968,
      estimatedCostUsd: 0.53,
    },
    {
      evaluatorId: "hallucination",
      evaluatorName: "Hallucination",
      matchingObservations: 715,
      sampling: 0.77,
      testRunCostUsd: 0.00042,
      estimatedCostUsd: 0.23,
    },
    {
      evaluatorId: "relevance",
      evaluatorName: "Answer relevance",
      matchingObservations: 715,
      sampling: 0.77,
      testRunCostUsd: 0.000512,
      estimatedCostUsd: 0.28,
    },
  ],
  unavailableEstimateCount: 0,
  matchingObservations: 715,
};

const meta = preview.meta({ component: ActivationConfirmationDialog });

export const CostWarning = meta.story({
  args: {
    ...sharedArgs,
    confirmation,
    estimate: unavailableEstimate,
  },
});

export const EstimatedCost = meta.story({
  args: {
    ...sharedArgs,
    confirmation,
    estimate: estimatedCost,
  },
});
