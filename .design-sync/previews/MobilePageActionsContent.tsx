import * as React from "react";

import {
  Badge,
  MobilePageActionsContent,
  Popover,
  PopoverTrigger,
} from "@langfuse/design-system";
import {
  History,
  LayoutDashboard,
  PencilIcon,
  Play,
  RefreshCw,
  Settings,
  SlidersHorizontal,
} from "@langfuse/icons";
import { HeaderActionMenuRow } from "../../web/src/components/HeaderActionMenuRow";
import { Button } from "../../web/src/components/ui/button";

// Popover/PopoverTrigger come from the bundle so they share a context with the bundled MobilePageActionsContent.

/** MenuRows mirrors the "Menu rows" story. */
export const MenuRows = () => (
  <div className="flex justify-end p-3">
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">More actions</Button>
      </PopoverTrigger>
      <MobilePageActionsContent onCloseAutoFocus={() => {}}>
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
);

/** MixedPageControls mirrors the "Mixed page controls" story. */
export const MixedPageControls = () => (
  <div className="flex justify-end p-3">
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">More actions</Button>
      </PopoverTrigger>
      <MobilePageActionsContent onCloseAutoFocus={() => {}}>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground px-2 text-xs">Dashboard</span>
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
);
