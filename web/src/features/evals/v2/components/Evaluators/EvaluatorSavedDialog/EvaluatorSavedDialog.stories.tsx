import { Button } from "@/src/components/ui/button";
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
    costEstimate: null,
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
