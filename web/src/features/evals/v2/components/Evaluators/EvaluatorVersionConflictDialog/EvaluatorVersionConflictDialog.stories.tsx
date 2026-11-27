import { OpenOverlay } from "@/src/components/design-system/OpenOverlay/OpenOverlay";
import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorVersionConflictDialog } from "./EvaluatorVersionConflictDialog";

const meta = preview.meta({
  component: EvaluatorVersionConflictDialog,
  render: (args) => (
    <OpenOverlay>
      <EvaluatorVersionConflictDialog {...args} />
    </OpenOverlay>
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
