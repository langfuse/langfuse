import { InfoIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

export function SectionHeader({
  title,
  meta,
  description,
  tooltip,
  trailing,
}: {
  title: string;
  meta: ReactNode;
  description: string | null;
  tooltip: string;
  trailing: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <h3 className="shrink-0 text-sm font-bold whitespace-nowrap">
          {title}
        </h3>
        {meta}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground rounded-sm focus-visible:ring-2 focus-visible:outline-hidden"
              aria-label={`About ${title}`}
            >
              <InfoIcon className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </div>
      {description ? (
        <p className="text-muted-foreground col-start-1 text-sm">
          {description}
        </p>
      ) : null}
      {trailing ? (
        <div className="col-start-2 row-start-2">{trailing}</div>
      ) : null}
    </div>
  );
}
