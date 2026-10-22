import { CircleFadingArrowUp } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { usePromotePromptVersion } from "@/src/features/prompts/components/usePromotePromptVersion";

const PROMOTE_LABEL = "Promote to production";

export function PromotePromptVersionIconButton({
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
  const label = hasAccess
    ? "Promote this version to production. The label moves off the current production version."
    : "You don't have permission to change prompt labels.";

  return (
    <Tooltip label={label} hoverableContent={false}>
      {({ getTriggerProps }) => (
        <IconButton
          {...getTriggerProps()}
          icon={CircleFadingArrowUp}
          label={PROMOTE_LABEL}
          size="sm"
          disabled={!hasAccess || isPending}
          data-version-trigger="true"
          onClick={(event) => {
            event.stopPropagation();
            promote();
          }}
        />
      )}
    </Tooltip>
  );
}
