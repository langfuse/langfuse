import { Button } from "@/src/components/ui/button";
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
      <TagIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
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

  // A read-only tag is not a control: a disabled button would dim it, drop it
  // from the tab order and announce as disabled. BadgeShell rather than Badge
  // because the tag icon leads and Badge only takes a trailing one.
  if (viewOnly) {
    // Badge takes no className, so the width cap lives on a wrapper.
    return (
      <span className="inline-flex max-w-40 min-w-0">
        <BadgeShell color="neutral">{label}</BadgeShell>
      </span>
    );
  }

  return (
    <Button
      key={tag}
      variant="tertiary"
      size="icon-sm"
      className="w-fit max-w-40 min-w-16"
      loading={loading}
    >
      {label}
    </Button>
  );
});
TagButton.displayName = "TagButton";
