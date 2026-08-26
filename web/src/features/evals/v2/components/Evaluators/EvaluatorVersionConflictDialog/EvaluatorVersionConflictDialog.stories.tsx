import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorVersionConflictDialog } from "./EvaluatorVersionConflictDialog";

const meta = preview.meta({ component: EvaluatorVersionConflictDialog });

export const Default = meta.story({
  args: {
    open: true,
    isOverriding: false,
    onOpenChange: fn(),
    onDiscard: fn(),
    onOverride: fn(),
  },
});

export const Overriding = meta.story({
  args: {
    open: true,
    isOverriding: true,
    onOpenChange: fn(),
    onDiscard: fn(),
    onOverride: fn(),
  },
});
