import { Button } from "@/src/components/ui/button";
import React from "react";

export const TagButton: React.FC<{ tag: string; loading: boolean }> =
  React.memo(({ tag, loading }) => (
    <Button
      key={tag}
      variant="secondary"
      size="xs"
      className="text-xs font-semibold hover:bg-background"
      loading={loading}
    >
      {tag}
    </Button>
  ));
TagButton.displayName = "TagButton";
