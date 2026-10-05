import { Star } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { cn } from "@/src/utils/tailwind";

export const ProjectStarButton = ({
  projectId,
  isStarred,
  onToggle,
}: {
  projectId: string;
  isStarred: boolean;
  onToggle: (projectId: string) => void;
}) => {
  const capture = usePostHogClientCapture();
  const label = isStarred ? "Unstar project" : "Star project";

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      aria-pressed={isStarred}
      title={label}
      className={cn(
        "relative z-10 shrink-0",
        isStarred
          ? "text-foreground"
          : "text-muted-foreground/50 hover:text-foreground",
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(projectId);
        capture("project_star:toggled", { starred: !isStarred });
      }}
    >
      <Star
        className={cn("h-4 w-4", isStarred && "fill-current")}
        aria-hidden="true"
      />
    </Button>
  );
};
