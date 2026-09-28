import { LayoutDashboard, PencilIcon, SlidersHorizontal } from "lucide-react";
import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { Button } from "@/src/components/ui/button";
import { Popover, PopoverTrigger } from "@/src/components/ui/popover";
import { MobilePageActionsContent } from "@/src/components/layouts/mobile-page-actions-content";

const meta = preview.meta({
  component: MobilePageActionsContent,
});

export const MixedPageControls = meta.story({
  name: "Mixed page controls",
  globals: { viewport: { value: "page-actions-phone", isRotated: false } },
  parameters: {
    viewport: {
      options: {
        "page-actions-phone": {
          name: "Phone",
          styles: { width: "390px", height: "844px" },
        },
      },
    },
  },
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">More actions</Button>
      </PopoverTrigger>
      <MobilePageActionsContent onCloseAutoFocus={fn()}>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground px-2 text-xs">Dashboard</span>
          <Button variant="outline" className="w-full justify-start gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Langfuse Home
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-2">
            <PencilIcon className="h-4 w-4" />
            Edit dashboard
          </Button>
        </div>
        <div className="flex flex-col gap-1 border-t pt-2">
          <span className="text-muted-foreground px-2 text-xs">Data</span>
          <Button variant="outline" className="w-full justify-start gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Environment and filters
          </Button>
        </div>
      </MobilePageActionsContent>
    </Popover>
  ),
});
