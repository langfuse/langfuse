import { Button } from "@/src/components/ui/button";

/** Header collapse control for long system prompts; rendered only while expanded. */
export function SystemPromptCollapseButton({
  onCollapse,
}: {
  onCollapse: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="xs"
      type="button"
      onClick={onCollapse}
      aria-label="Collapse system prompt"
      title="Collapse system prompt"
      className="text-muted-foreground hover:bg-border w-fit text-xs"
    >
      Collapse
    </Button>
  );
}
