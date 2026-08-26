import { fn } from "storybook/test";
import type { ComponentProps } from "react";
import preview from "../../../../../../../../../.storybook/preview";
import { RulesOverviewSelectionBarView } from "./RulesOverviewSelectionBarView";

const meta = preview.meta({ component: RulesOverviewSelectionBarView });

const defaultArgs = {
  selectedCount: 3,
  hasWriteAccess: true,
  statusChangePending: false,
  deletePending: false,
  deleteDialogOpen: false,
  onClear: fn(),
  onEnable: fn(),
  onDisable: fn(),
  onDelete: fn(),
  onDeleteDialogOpenChange: fn(),
  onConfirmDelete: fn(),
} satisfies ComponentProps<typeof RulesOverviewSelectionBarView>;

export const Default = meta.story({
  args: defaultArgs,
});

export const ReadOnly = meta.story({
  args: {
    ...defaultArgs,
    hasWriteAccess: false,
  },
});

export const DeleteConfirmation = meta.story({
  args: {
    ...defaultArgs,
    deleteDialogOpen: true,
  },
});
