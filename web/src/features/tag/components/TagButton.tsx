import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { TagIcon } from "lucide-react";
import React from "react";

export const TagButton: React.FC<{
  tag: string;
  loading: boolean;
  viewOnly?: boolean;
}> = React.memo(({ tag, loading, viewOnly = false }) => (
  <Button
    key={tag}
    variant="tertiary"
    size="icon-sm"
    disabled={viewOnly}
    className={cn(viewOnly && "cursor-default")}
    loading={loading}
  >
    <TagIcon className="mr-1 h-3.5 w-3.5" />
    {tag}
  </Button>
));
TagButton.displayName = "TagButton";
