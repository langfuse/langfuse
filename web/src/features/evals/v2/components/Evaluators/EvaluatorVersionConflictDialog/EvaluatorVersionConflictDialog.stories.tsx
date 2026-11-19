import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorVersionConflictDialog } from "./EvaluatorVersionConflictDialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";

const meta = preview.meta({
  component: EvaluatorVersionConflictDialog,
  render: (args) => (
    <DialogController
      initialState={() => true}
      onBeforeClose={() => !args.isOverriding}
      renderDialog={() => <EvaluatorVersionConflictDialog {...args} />}
    >
      {() => null}
    </DialogController>
  ),
});

export const Default = meta.story({
  args: {
    isOverriding: false,
    onDiscard: fn(),
    onOverride: fn(),
  },
});

export const Overriding = meta.story({
  args: {
    isOverriding: true,
    onDiscard: fn(),
    onOverride: fn(),
  },
});
