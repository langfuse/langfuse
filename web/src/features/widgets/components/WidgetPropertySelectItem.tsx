import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { HoverCardPortal } from "@radix-ui/react-hover-card";
import { SelectItem } from "@/src/components/ui/select";
import * as React from "react";

/**
 * Generic SelectItem with a hover-card that shows documentation for a widget property
 * (view, metric, dimension).
 */
export const WidgetPropertySelectItem = ({
  value,
  label,
  description,
  unit,
  type,
  className,
}: {
  value: string;
  label: string;
  description?: string;
  unit?: string;
  type?: string;
  className?: string;
}) => {
  return (
    <HoverCard openDelay={0} closeDelay={0}>
      <HoverCardTrigger asChild>
        <SelectItem value={value} className={className ?? "max-w-56"}>
          {label}
        </SelectItem>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent hideWhenDetached align="start" side="right">
          <div className="mb-1 font-bold text-sm">{label}</div>
          {(unit || type) && (
            <div className="mb-2 flex flex-wrap gap-2 text-xs">
              {unit && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                  Unit: {unit}
                </span>
              )}
              {type && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                  Type: {type}
                </span>
              )}
            </div>
          )}
          {description && <p className="text-xs leading-snug">{description}</p>}
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
};
