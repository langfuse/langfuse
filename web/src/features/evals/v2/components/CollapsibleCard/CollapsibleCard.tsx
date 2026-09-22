import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { cn } from "@/src/utils/tailwind";

/** A framed disclosure with a consistent header surface and collapse affordance. */
export function CollapsibleCard({
  open,
  onOpenChange,
  disabled,
  triggerTitle,
  header,
  headerInteractive = true,
  actions,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  triggerTitle: string;
  header: ReactNode;
  headerInteractive?: boolean;
  actions: ReactNode;
  children: ReactNode;
}) {
  const headerContent = (
    <>
      <ChevronDown
        className={cn(
          "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform",
          open ? "rotate-0" : "-rotate-90",
        )}
      />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">{header}</span>
    </>
  );

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} disabled={disabled}>
      <div className="bg-card text-card-foreground overflow-hidden rounded-md border">
        <div className="bg-secondary text-secondary-foreground flex min-h-9 min-w-0 items-center text-sm">
          {headerInteractive ? (
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="hover:bg-accent hover:text-accent-foreground disabled:hover:bg-secondary disabled:hover:text-secondary-foreground flex min-h-9 min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
                title={triggerTitle}
              >
                {headerContent}
              </button>
            </CollapsibleTrigger>
          ) : (
            <div className="flex min-h-9 min-w-0 flex-1 items-center gap-2 px-3 py-1.5">
              {headerContent}
            </div>
          )}
          {actions}
        </div>
        <CollapsibleContent>
          <div className="border-t">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
