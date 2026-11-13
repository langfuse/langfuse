import { X } from "@langfuse/icons";

import { TagShell } from "@/src/components/design-system/Tag/Tag";
import {
  describeGatewayModelPattern,
  isGatewayModelExcludePattern,
} from "@/src/features/ai-gateway/fns/gatewayModelPatterns";
import { cn } from "@/src/utils/tailwind";

type ModelPatternTagProps = {
  pattern: string;
  /** Selected with the keyboard from the models input. */
  isActive: boolean;
  onEdit: (pattern: string) => void;
  onRemove: (pattern: string) => void;
};

/** Exclude patterns, which start with `-`, show their models struck through. Clicking the text edits the pattern. */
export function ModelPatternTag({
  pattern,
  isActive,
  onEdit,
  onRemove,
}: ModelPatternTagProps) {
  const isExclude = isGatewayModelExcludePattern(pattern);
  const description = describeGatewayModelPattern(pattern);
  const keepInputFocused = (event: React.MouseEvent<HTMLButtonElement>) =>
    event.preventDefault();
  const handleEditClick = () => onEdit(pattern);
  const handleRemoveClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onRemove(pattern);
  };

  return (
    <span
      data-active={isActive || undefined}
      className="data-active:ring-ring flex min-w-0 rounded-sm data-active:ring-2"
    >
      <TagShell>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Edit ${pattern}`}
          title={description}
          className={cn(
            "min-w-0 cursor-text truncate py-0.5",
            isExclude && "line-through",
          )}
          onMouseDown={keepInputFocused}
          onClick={handleEditClick}
        >
          {isExclude ? pattern.slice(1) : pattern}
        </button>
        <button
          type="button"
          aria-label={`Remove ${pattern}`}
          className="text-foreground-tertiary hover:text-foreground -mr-0.5 flex shrink-0 items-center rounded-sm"
          onClick={handleRemoveClick}
        >
          <X size="sm" />
        </button>
      </TagShell>
    </span>
  );
}
