import preview from "../../../../../../../../../.storybook/preview";
import { ActivationCostEstimateView } from "./ActivationCostEstimateView";

const meta = preview.meta({ component: ActivationCostEstimateView });

export const MultipleEvaluators = meta.story({
  args: {
    estimates: [
      {
        evaluatorId: "quality",
        evaluatorName: "Quality judge",
        matchingObservations: 1250,
        sampling: 0.5,
        testRunCostUsd: 0.002,
        estimatedCostUsd: 1.25,
      },
      {
        evaluatorId: "relevance",
        evaluatorName: "Answer relevance",
        matchingObservations: 1250,
        sampling: 0.5,
        testRunCostUsd: 0.001,
        estimatedCostUsd: 0.625,
      },
    ],
  },
});

export const SingleEvaluator = meta.story({
  args: {
    estimates: [
      {
        evaluatorId: "quality",
        evaluatorName: "Quality judge",
        matchingObservations: 1,
        sampling: 1,
        testRunCostUsd: 0.004,
        estimatedCostUsd: 0.004,
      },
    ],
  },
});
