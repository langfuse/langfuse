import * as React from "react";
import {
  LayoutDashboard,
  PencilIcon,
  SlidersHorizontal,
} from "@langfuse/icons";
import { Button } from "../../web/src/components/ui/button";
import {
  MobilePageActionsContent,
  Popover,
  PopoverTrigger,
} from "@langfuse/design-system";

// Mirrors mobile-page-actions-content.stories.tsx "Mixed page controls".
// Popover/PopoverTrigger come from the bundle so they share a context with the
// bundled MobilePageActionsContent (it renders the ui PopoverContent).
export const MixedPageControls = () => (
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
);
