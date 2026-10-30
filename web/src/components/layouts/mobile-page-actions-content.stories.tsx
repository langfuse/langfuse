import {
  History,
  LayoutDashboard,
  PencilIcon,
  Play,
  RefreshCw,
  Settings,
  SlidersHorizontal,
} from "@langfuse/icons";
import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { HeaderActionMenuRow } from "@/src/components/HeaderActionMenuRow";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/ui/button";
import { Popover, PopoverTrigger } from "@/src/components/ui/popover";
import { MobilePageActionsContent } from "@/src/components/layouts/MobilePageActionsContent";

const phoneViewport = {
  globals: { viewport: { value: "page-actions-phone", isRotated: false } },
  parameters: {
    layout: "fullscreen",
    viewport: {
      options: {
        "page-actions-phone": {
          name: "Phone",
          styles: { width: "390px", height: "844px" },
        },
      },
    },
  },
} as const;

const meta = preview.meta({
  component: MobilePageActionsContent,
});

export const MenuRows = meta.story({
  name: "Menu rows",
  ...phoneViewport,
  render: () => (
    <div className="flex justify-end p-3">
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button variant="outline">More actions</Button>
        </PopoverTrigger>
        <MobilePageActionsContent onCloseAutoFocus={fn()}>
          <div className="flex flex-col items-stretch gap-0.5">
            <HeaderActionMenuRow
              label="Auto-analyze"
              icon={<Play size="base" color="default" />}
              badge={<Badge text="On" size="sm" />}
            />
            <HeaderActionMenuRow
              label="Regenerate topics"
              icon={<RefreshCw size="base" color="default" />}
            />
            <HeaderActionMenuRow
              label="History"
              icon={<History size="base" color="default" />}
            />
            <HeaderActionMenuRow
              label="Settings"
              icon={<Settings size="base" color="default" />}
            />
          </div>
        </MobilePageActionsContent>
      </Popover>
    </div>
  ),
});

export const MixedPageControls = meta.story({
  name: "Mixed page controls",
  ...phoneViewport,
  render: () => (
    <div className="flex justify-end p-3">
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button variant="outline">More actions</Button>
        </PopoverTrigger>
        <MobilePageActionsContent onCloseAutoFocus={fn()}>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground px-2 text-xs">
              Dashboard
            </span>
            <Button variant="outline" className="w-full justify-start gap-2">
              <LayoutDashboard size="base" color="default" />
              Langfuse Home
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-2">
              <PencilIcon size="base" color="default" />
              Edit dashboard
            </Button>
          </div>
          <div className="flex flex-col gap-1 border-t pt-2">
            <span className="text-muted-foreground px-2 text-xs">Data</span>
            <Button variant="outline" className="w-full justify-start gap-2">
              <SlidersHorizontal size="base" color="default" />
              Environment and filters
            </Button>
          </div>
        </MobilePageActionsContent>
      </Popover>
    </div>
  ),
});
