import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { cn } from "@/src/utils/tailwind";
import { TagIcon } from "lucide-react";
import React from "react";

export const TagButton: React.FC<{
  tag: string;
  loading: boolean;
  viewOnly?: boolean;
  isTableCell?: boolean;
}> = React.memo(({ tag, loading, viewOnly = false, isTableCell = false }) => {
  const label = (
    <>
      <TagIcon className="text-foreground-tertiary size-3 shrink-0" />
      <span
        className={cn(
          "overflow-hidden text-ellipsis whitespace-nowrap",
          !isTableCell && "text-xs",
        )}
        title={tag}
      >
        {tag}
      </span>
    </>
  );

  if (viewOnly) {
    return (
      <span className="inline-flex max-w-40 min-w-0">
        <BadgeShell>{label}</BadgeShell>
      </span>
    );
  }

  return (
    <BadgeShell asChild>
      <button
        key={tag}
        type="button"
        disabled={loading}
        className="focus-visible:ring-ring hover:bg-accent w-fit max-w-40 min-w-0 focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label}
      </button>
    </BadgeShell>
  );
});
TagButton.displayName = "TagButton";
