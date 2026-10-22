import { CircleFadingArrowUp } from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import { usePromotePromptVersion } from "@/src/features/prompts/components/usePromotePromptVersion";

const PROMOTE_LABEL = "Promote to production";

export function PromotePromptVersionButton({
  projectId,
  promptId,
  labels,
  version,
}: {
  projectId: string;
  promptId: string;
  labels: readonly string[];
  version: number;
}) {
  const { promote, isPending, hasAccess } = usePromotePromptVersion({
    projectId,
    promptId,
    labels,
    version,
  });

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1"
      loading={isPending}
      disabled={!hasAccess}
      aria-label={PROMOTE_LABEL}
      title={
        hasAccess
          ? "Move the production label to this version. The previous production version loses it."
          : "You don't have permission to change prompt labels."
      }
      onClick={() => {
        promote();
      }}
    >
      <CircleFadingArrowUp size="base" color="default" aria-hidden />
      {PROMOTE_LABEL}
    </Button>
  );
}
