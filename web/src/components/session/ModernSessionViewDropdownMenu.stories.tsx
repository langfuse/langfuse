import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import {
  ModernSessionViewDropdownMenu,
  type ModernSessionViewDropdownMenuControls,
} from "@/src/components/session/ModernSessionViewDropdownMenu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";

const savedViews = [
  {
    id: "view-agent-steps",
    name: "Agent steps",
    filters: [],
    columnOrder: [],
    columnVisibility: {},
    orderBy: null,
    searchQuery: "",
  },
  {
    id: "view-generations",
    name: "Generations only",
    filters: [],
    columnOrder: [],
    columnVisibility: {},
    orderBy: null,
    searchQuery: "",
  },
] satisfies ModernSessionViewDropdownMenuControls["savedViews"];

const controls = {
  matchingSystemPresetId: "__langfuse_with_io__",
  matchingSavedViewId: undefined,
  savedViews,
  onApplyPreset: fn(),
  onApplySavedView: fn(),
  onManageViews: fn(),
  onOpenFilterDialog: fn(),
} satisfies ModernSessionViewDropdownMenuControls;

const meta = preview.meta({
  component: ModernSessionViewDropdownMenu,
  render: (args) => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
      <ModernSessionViewDropdownMenu {...args} />
    </DropdownMenu>
  ),
});

export default meta;

export const Default = meta.story({
  args: { controls },
});

export const WithoutSavedViews = meta.story({
  args: {
    controls: {
      ...controls,
      matchingSystemPresetId: undefined,
      savedViews: [],
    },
  },
});
