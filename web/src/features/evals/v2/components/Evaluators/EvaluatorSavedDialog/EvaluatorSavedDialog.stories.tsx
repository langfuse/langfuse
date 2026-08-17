import { Button } from "@/src/components/ui/button";
import { ActivationCostEstimateDetails } from "@/src/features/evals/v2/components/Rules/ActivationConfirmationDialog/components/ActivationCostEstimateDetails/ActivationCostEstimateDetails";
import preview from "../../../../../../../.storybook/preview";
import { fn } from "storybook/test";
import { EvaluatorSavedDialog } from "./EvaluatorSavedDialog";

const meta = preview.meta({ component: EvaluatorSavedDialog });

export const CreateRuleSelected = meta.story({
  args: {
    open: true,
    rulePicker: (
      <Button variant="outline" className="w-full justify-start font-normal">
        Create new rule
      </Button>
    ),
    costEstimate: null,
    canSubmit: true,
    isAttaching: false,
    isEstimating: false,
    primaryActionLabel: "Create rule",
    onOpenChange: fn(),
    onPrimaryAction: fn(),
  },
});

export const RuleSelected = meta.story({
  args: {
    open: true,
    rulePicker: (
      <Button variant="outline" className="w-full justify-start font-normal">
        Production observations
      </Button>
    ),
    costEstimate: (
      <ActivationCostEstimateDetails
        estimates={[
          {
            evaluatorId: "evaluator-1",
            evaluatorName: "Conciseness",
            matchingObservations: 1_900,
            sampling: 1,
            testRunCostUsd: 0.001,
            estimatedCostUsd: 1.9,
          },
        ]}
        unavailableEstimateCount={0}
        matchingObservations={1_900}
        sampling={1}
        descriptionAsTooltip
      />
    ),
    canSubmit: true,
    isAttaching: false,
    isEstimating: false,
    primaryActionLabel: "Attach and run",
    onOpenChange: fn(),
    onPrimaryAction: fn(),
  },
});

export const Loading = meta.story({
  args: {
    open: true,
    rulePicker: (
      <Button variant="outline" className="w-full justify-start font-normal">
        Production observations
      </Button>
    ),
    costEstimate: null,
    canSubmit: true,
    isAttaching: false,
    isEstimating: true,
    primaryActionLabel: "Attach and run",
    onOpenChange: fn(),
    onPrimaryAction: fn(),
  },
});
