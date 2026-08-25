import type { ObservationType } from "@langfuse/shared";
import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { ItemBadge } from "@/src/components/ItemBadge";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { cn } from "@/src/utils/tailwind";

export interface ObservationDetailViewHeaderProps {
  observationType: ObservationType;
  title: string;
  startTime: Date;
  titleActions: ReactNode;
  toolbarActions: ReactNode;
  mobileMenuActions: ReactNode;
  badges: ReactNode;
}

export function ObservationDetailViewHeader({
  observationType,
  title,
  startTime,
  titleActions,
  toolbarActions,
  mobileMenuActions,
  badges,
}: ObservationDetailViewHeaderProps) {
  const isMobile = useIsMobile();

  return (
    <div className="@container shrink-0 space-y-2 border-b p-2">
      <div className="grid w-full grid-cols-1 items-start gap-2 @2xl:grid-cols-[auto_auto] @2xl:justify-between">
        <div className="flex w-full flex-row items-center gap-1">
          <ItemBadge type={observationType} isSmall />
          <span
            className={cn(
              "mb-0 line-clamp-2 min-w-0 font-bold break-all md:break-normal md:wrap-break-word",
              isMobile && "flex-1",
            )}
          >
            {title}
          </span>
          {titleActions}
          {isMobile ? (
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
                // Connected actions may respond to deep links while the menu is closed.
                forceMount
                className="flex w-auto min-w-44 flex-col gap-0.5 p-1 data-[state=closed]:hidden"
              >
                {mobileMenuActions}
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
        {!isMobile ? (
          <div className="flex h-full flex-wrap content-start items-start justify-start gap-0.5 @2xl:mr-1 @2xl:justify-end">
            {toolbarActions}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <LocalIsoDate date={startTime} accuracy="millisecond" />
        </div>
        {badges ? <CollapsibleBadgeRow>{badges}</CollapsibleBadgeRow> : null}
      </div>
    </div>
  );
}
