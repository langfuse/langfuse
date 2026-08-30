import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorSetupFooterView } from "./EvaluatorSetupFooterView";

const meta = preview.meta({ component: EvaluatorSetupFooterView });

const createNextStep =
  "Next: attach a rule to run this evaluator on incoming observations.";

export const Default = meta.story({
  args: {
    mode: "create",
    children: createNextStep,
    closeLabel: "Close",
    saveLabel: "Create evaluator",
    isSaving: false,
    saveDisabled: false,
    disabledReason: null,
    onClose: fn(),
    onSave: fn(),
  },
});

export const Editing = meta.story({
  args: {
    mode: "edit",
    closeLabel: "Close",
    saveLabel: "Save changes",
    isSaving: false,
    saveDisabled: false,
    disabledReason: null,
    onClose: fn(),
    onSave: fn(),
  },
});

export const Disabled = meta.story({
  args: {
    mode: "create",
    children: createNextStep,
    closeLabel: "Close",
    saveLabel: "Create evaluator",
    isSaving: false,
    saveDisabled: true,
    disabledReason: "Add an evaluator name before saving.",
    onClose: fn(),
    onSave: fn(),
  },
});
