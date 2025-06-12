import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { TagIcon } from "lucide-react";
import React from "react";

export const TagButton: React.FC<{
  tag: string;
  loading: boolean;
  viewOnly?: boolean;
  isTableCell?: boolean;
}> = React.memo(({ tag, loading, viewOnly = false, isTableCell = false }) => (
  <Button
    key={tag}
    variant="tertiary"
    size="icon-sm"
    disabled={viewOnly}
    className={cn(viewOnly && "cursor-default")}
    loading={loading}
  >
    <TagIcon className="mr-1 h-3.5 w-3.5 flex-shrink-0" />
    <span
      className={cn(
        "w-full whitespace-nowrap",
        !isTableCell &&
          "min-w-6 whitespace-normal break-all text-xs sm:min-w-0 sm:break-normal sm:break-words",
      )}
    >
      {tag}
    </span>
  </Button>
));
TagButton.displayName = "TagButton";
