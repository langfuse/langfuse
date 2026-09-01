import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";

/** A framed disclosure with a consistent header surface and collapse affordance. */
export function CollapsibleCard({
  open,
  onOpenChange,
  disabled,
  triggerTitle,
  header,
  actions,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  triggerTitle: string;
  header: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} disabled={disabled}>
      <div className="bg-card text-card-foreground overflow-hidden rounded-md border">
        <div className="bg-secondary text-secondary-foreground flex min-h-9 min-w-0 items-center text-sm">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group hover:bg-accent hover:text-accent-foreground disabled:hover:bg-secondary disabled:hover:text-secondary-foreground flex min-h-9 min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
              title={triggerTitle}
            >
              <ChevronDown className="text-muted-foreground h-3.5 w-3.5 shrink-0 -rotate-90 transition-transform group-data-[state=open]:rotate-0" />
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                {header}
              </span>
            </button>
          </CollapsibleTrigger>
          {actions}
        </div>
        <CollapsibleContent>
          <div className="border-t">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
