import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import React from "react";

export const TagButton: React.FC<{
  tag: string;
  loading: boolean;
  viewOnly?: boolean;
}> = React.memo(({ tag, loading, viewOnly = false }) => (
  <Button
    key={tag}
    variant="secondary"
    size="xs"
    className={cn(
      "text-xs font-semibold",
      !viewOnly && "hover:bg-background",
      viewOnly && "cursor-default",
    )}
    loading={loading}
  >
    {tag}
  </Button>
));
TagButton.displayName = "TagButton";
