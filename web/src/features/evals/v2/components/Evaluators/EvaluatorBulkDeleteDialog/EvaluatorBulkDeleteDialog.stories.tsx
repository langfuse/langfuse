import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorBulkDeleteDialog } from "./EvaluatorBulkDeleteDialog";

const meta = preview.meta({ component: EvaluatorBulkDeleteDialog });

export const Selected = meta.story({
  args: {
    open: true,
    scope: "selected",
    isDeleting: false,
    onOpenChange: fn(),
    onConfirm: fn(),
  },
});

export const AllMatching = meta.story({
  args: {
    open: true,
    scope: "allMatching",
    isDeleting: false,
    onOpenChange: fn(),
    onConfirm: fn(),
  },
});
