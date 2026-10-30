/* eslint-disable @repo/no-style-props, @repo/component-file-structure */
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import * as React from "react";

interface PropertyHoverCardProps {
  label: string;
  description?: string;
  unit?: string;
  type?: string;
  children: React.ReactElement<React.HTMLProps<HTMLElement>>;
}

export const PropertyHoverCard = ({
  label,
  description,
  unit,
  type,
  children,
}: PropertyHoverCardProps) => {
  return (
    <HoverCard
      openDelay={0}
      closeDelay={0}
      hideWhenDetached
      placement="right-start"
      content={
        <div className="w-64 p-3">
          <div className="mb-1 text-sm font-bold">{label}</div>
          {(unit || type) && (
            <div className="mb-2 flex flex-wrap gap-2 text-xs">
              {unit && (
                <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                  Unit: {unit}
                </span>
              )}
              {type && (
                <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                  Type: {type}
                </span>
              )}
            </div>
          )}
          {description && <p className="text-xs leading-snug">{description}</p>}
        </div>
      }
    >
      {/* Anchors the card on the item itself, not a full-width wrapper. */}
      {({ getTriggerProps }) =>
        React.cloneElement(children, getTriggerProps(children.props))
      }
    </HoverCard>
  );
};
