/**
 * MobileHeaderOverflowPopover - the mobile `⋯` overflow for detail-header
 * actions (LFE-11067), shared by the trace detail header and the consolidated
 * trace side panel. Children are full-width labeled menu rows (`layout="menu"`
 * variants of the action components, or ghost Buttons styled the same way).
 */

import { type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";

export function MobileHeaderOverflowPopover({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="More actions"
          className="ml-auto shrink-0"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        // forceMount + hide-when-closed: CommentDrawerButton lives in here,
        // and its deep-link auto-open effect (?comments=open) and controlled
        // inline-selection flow only work while mounted. A default Popover
        // unmounts its content when closed (the default state), silently
        // breaking both. Keep it mounted, just hidden.
        forceMount
        className="flex w-auto min-w-44 flex-col gap-0.5 p-1 data-[state=closed]:hidden"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
