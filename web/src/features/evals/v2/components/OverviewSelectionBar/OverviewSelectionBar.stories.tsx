import { fn } from "storybook/test";
import { Trash2 } from "lucide-react";

import preview from "../../../../../../.storybook/preview";
import { Button } from "@/src/components/ui/button";
import { OverviewSelectionBar } from "./OverviewSelectionBar";

const meta = preview.meta({ component: OverviewSelectionBar });

export const Default = meta.story({
  args: {
    selectedCount: 3,
    onClear: fn(),
    children: (
      <Button type="button" variant="outline" size="sm" className="h-8">
        <Trash2 className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Delete</span>
      </Button>
    ),
  },
});

export const Hidden = meta.story({
  args: {
    selectedCount: 0,
    onClear: fn(),
    children: null,
  },
});
