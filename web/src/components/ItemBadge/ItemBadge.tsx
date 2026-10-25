/* eslint-disable @repo/no-style-props */
import { ItemTypeIcon } from "../ItemTypeIcon/ItemTypeIcon";
import { cn } from "@/src/utils/tailwind";

import { type LangfuseItemType } from "@/src/utils/itemType";
import { getItemTypeLabels } from "./fns/getItemTypeLabels";

/** Outline chip chrome for the type badge. */
const itemBadgeClassName =
  "inline-flex h-5.5 items-center gap-1.5 rounded-sm border border-border pr-1.5 pl-2 text-xs leading-none font-normal text-foreground-secondary transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2";

export function ItemBadge({
  type,
  showLabel = false,
  isSmall = false,
  className,
}: {
  type: LangfuseItemType;
  showLabel?: boolean;
  isSmall?: boolean;
  className?: string;
}) {
  const { label, displayLabel } = getItemTypeLabels(type);

  return (
    <div
      title={label}
      className={cn(
        itemBadgeClassName,
        "flex max-w-fit items-center gap-1 overflow-hidden whitespace-nowrap",
        // Icon-only: square box, `max-w-none` so the width is not capped at the icon.
        showLabel
          ? "px-1"
          : cn(
              "max-w-none justify-center border-transparent p-0",
              isSmall ? "size-4" : "size-6",
            ),
        isSmall && showLabel && "h-4",
      )}
    >
      {!showLabel && (
        <ItemTypeIcon
          type={type}
          size={isSmall ? "sm" : "base"}
          color="type"
          className={className}
        />
      )}
      {showLabel && (
        <span className="truncate" title={displayLabel}>
          {displayLabel}
        </span>
      )}
    </div>
  );
}
