import { type ColumnDefinition, type FilterState } from "@langfuse/shared";
import { type ComponentProps } from "react";
import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { ModernSessionFilterDialogContent } from "@/src/components/session/ModernSessionFilterDialogContent";
import { Dialog } from "@/src/components/ui/dialog";

const filterColumns = [
  {
    name: "Name",
    id: "name",
    type: "stringOptions",
    internal: "name",
    options: [{ value: "generate-response" }, { value: "retrieve-context" }],
  },
  {
    name: "Type",
    id: "type",
    type: "stringOptions",
    internal: "type",
    options: [{ value: "GENERATION" }, { value: "SPAN" }],
  },
] satisfies ColumnDefinition[];

const filters = [
  {
    column: "type",
    type: "stringOptions",
    operator: "any of",
    value: ["GENERATION"],
  },
] satisfies FilterState;

const defaultArgs = {
  initialFilters: [],
  filterColumns,
  filterColumnsWithCustomSelect: [],
  viewActions: { type: "none" },
  onCancel: fn(),
  onApplyFilters: fn(),
} satisfies ComponentProps<typeof ModernSessionFilterDialogContent>;

const meta = preview.meta({
  component: ModernSessionFilterDialogContent,
  decorators: [
    (Story) => (
      <Dialog open onOpenChange={fn()}>
        <Story />
      </Dialog>
    ),
  ],
  parameters: { layout: "fullscreen" },
});

export default meta;

export const Default = meta.story({
  args: defaultArgs,
});

export const WithFilters = meta.story({
  args: {
    ...defaultArgs,
    initialFilters: filters,
  },
});

export const CanSaveView = meta.story({
  args: {
    ...defaultArgs,
    initialFilters: filters,
    viewActions: { type: "create", onCreate: fn() },
  },
});

export const CanUpdateSelectedView = meta.story({
  args: {
    ...defaultArgs,
    initialFilters: filters,
    viewActions: {
      type: "update",
      viewName: "Generations",
      isUpdating: false,
      onCreate: fn(),
      onUpdate: fn(),
    },
  },
});
