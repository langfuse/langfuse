import { Tag, TagShell } from "@/src/components/design-system/Tag/Tag";
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
      <TagIcon className="text-foreground-tertiary icon-sm shrink-0" />
      <span
        className={cn(
          "overflow-hidden py-0.5 text-ellipsis whitespace-nowrap",
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
        <Tag text={tag} icon={TagIcon} />
      </span>
    );
  }

  return (
    <TagShell asChild>
      <button
        key={tag}
        type="button"
        disabled={loading}
        className="focus-visible:ring-ring hover:bg-accent w-fit max-w-40 min-w-0 focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label}
      </button>
    </TagShell>
  );
});
TagButton.displayName = "TagButton";
