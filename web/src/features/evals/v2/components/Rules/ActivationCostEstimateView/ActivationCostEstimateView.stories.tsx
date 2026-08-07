import preview from "../../../../../../../.storybook/preview";
import { ActivationCostEstimateView } from "./ActivationCostEstimateView";

const meta = preview.meta({ component: ActivationCostEstimateView });

export const TestRunCost = meta.story({
  args: {
    matchingObservations: 1250,
    sampling: 0.5,
    costPerEvaluation: 0.002,
    dailyCostUsd: 1.25,
    costSource: "the evaluator test run",
  },
});

export const HistoricalCost = meta.story({
  args: {
    matchingObservations: 1,
    sampling: 1,
    costPerEvaluation: 0.004,
    dailyCostUsd: 0.004,
    costSource: "average evaluator execution cost over the last 7 days",
  },
});
