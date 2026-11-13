import { X } from "@langfuse/icons";

import { TagShell } from "@/src/components/design-system/Tag/Tag";
import {
  describeGatewayModelPattern,
  isGatewayModelExcludePattern,
} from "@/src/features/ai-gateway/fns/gatewayModelPatterns";
import { cn } from "@/src/utils/tailwind";

type ModelPatternTagProps = {
  pattern: string;
  onRemove: (pattern: string) => void;
};

/** Exclude patterns, which start with `-`, show their models struck through. */
export function ModelPatternTag({ pattern, onRemove }: ModelPatternTagProps) {
  const isExclude = isGatewayModelExcludePattern(pattern);
  const description = describeGatewayModelPattern(pattern);
  const handleRemoveClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onRemove(pattern);
  };

  return (
    <TagShell>
      <span
        className={cn("min-w-0 truncate py-0.5", isExclude && "line-through")}
        title={description}
      >
        {isExclude ? pattern.slice(1) : pattern}
      </span>
      <button
        type="button"
        aria-label={`Remove ${pattern}`}
        className="text-foreground-tertiary hover:text-foreground -mr-0.5 flex shrink-0 items-center rounded-sm"
        onClick={handleRemoveClick}
      >
        <X size="sm" />
      </button>
    </TagShell>
  );
}
