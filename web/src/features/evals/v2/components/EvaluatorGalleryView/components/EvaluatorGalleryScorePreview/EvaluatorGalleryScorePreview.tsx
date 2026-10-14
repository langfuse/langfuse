import { ChevronRight } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import type { ManagedTemplate } from "@/src/features/evals/v2/types/templateGallery";
import { cn } from "@/src/utils/tailwind";

const MAX_VISIBLE_SCORES = 1;

const MESH_TINT: Partial<Record<EvalTemplateType, string>> = {
  [EvalTemplateTypeEnum.LLM_AS_JUDGE]: "preview-mesh-judge",
  [EvalTemplateTypeEnum.DECISION_MODEL]: "preview-mesh-decision-model",
  [EvalTemplateTypeEnum.CODE]: "preview-mesh-code",
};

/** Sample `name: value` chips on a type-tinted mesh, styled like trace score badges. */
type EvaluatorGalleryScorePreviewProps = {
  scores: ManagedTemplate["previewScores"];
  type: EvalTemplateType;
};

export function EvaluatorGalleryScorePreview({
  scores,
  type,
}: EvaluatorGalleryScorePreviewProps) {
  const visibleScores = scores.slice(0, MAX_VISIBLE_SCORES);
  const hiddenCount = scores.length - visibleScores.length;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "preview-mesh flex h-20 items-center justify-center gap-1 overflow-hidden rounded-md px-3",
        MESH_TINT[type],
      )}
    >
      <div className="flex min-w-0 items-center justify-center gap-1">
        {visibleScores.map((score) => (
          <span key={score.name} className="flex min-w-0">
            <BadgeShell color="filled" size="md">
              <span className="text-muted-foreground flex min-w-0 font-mono">
                <span className="truncate py-0.5" title={score.name}>
                  {score.name}
                </span>
                <span className="py-0.5">:</span>
              </span>
              <span className="text-foreground py-0.5 font-mono text-nowrap">
                {score.value}
              </span>
            </BadgeShell>
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span className="text-muted-foreground shrink-0 text-xs">
            +{hiddenCount}
          </span>
        ) : null}
      </div>
      <div className="bg-foreground/40 text-background absolute inset-0 hidden items-center justify-center backdrop-blur-xs group-hover/card:flex">
        <span className="flex items-center gap-1 text-sm font-bold">
          Use template
          {/* Same optical nudge as DropdownIndicator for icons beside text. */}
          <ChevronRight className="icon-base translate-y-px" />
        </span>
      </div>
    </div>
  );
}
