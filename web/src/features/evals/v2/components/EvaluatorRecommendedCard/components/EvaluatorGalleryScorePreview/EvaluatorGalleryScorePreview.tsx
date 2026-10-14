import { ChevronRight } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import type { ManagedTemplate } from "@/src/features/evals/v2/types/templateGallery";
import { cn } from "@/src/utils/tailwind";

import styles from "./EvaluatorGalleryScorePreview.module.css";

const MAX_VISIBLE_SCORES = 1;

const MESH_TINT: Partial<Record<EvalTemplateType, string>> = {
  [EvalTemplateTypeEnum.LLM_AS_JUDGE]: styles.judge,
  [EvalTemplateTypeEnum.DECISION_MODEL]: styles.decisionModel,
  [EvalTemplateTypeEnum.CODE]: styles.code,
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
        styles.preview,
        MESH_TINT[type],
        "flex h-20 items-center justify-center gap-1 overflow-hidden rounded-md px-3",
      )}
    >
      <div className="flex max-w-full min-w-0 items-center justify-center gap-1">
        {visibleScores.map((score) => (
          <span key={score.name} className="flex min-w-0">
            <BadgeShell color="filled" size="md">
              <span className="text-muted-foreground flex min-w-0 font-mono">
                <span className="truncate py-0.5" title={score.name}>
                  {score.name}
                </span>
                <span className="py-0.5">:</span>
              </span>
              <span
                className="text-foreground truncate py-0.5 font-mono"
                title={score.value}
              >
                {score.value}
              </span>
            </BadgeShell>
          </span>
        ))}
        {hiddenCount > 0 ? (
          <BadgeShell color="filled" size="md">
            <span className="text-muted-foreground py-0.5 font-mono">
              +{hiddenCount}
            </span>
          </BadgeShell>
        ) : null}
      </div>
      {/* Shown while the parent card (group/card) is hovered. */}
      <div className="absolute inset-0 hidden items-center justify-center bg-black/40 text-white backdrop-blur-xs group-hover/card:flex">
        <span className="flex items-center gap-1 text-sm font-bold">
          Use template
          {/* Same optical nudge as DropdownIndicator for icons beside text. */}
          <ChevronRight className="icon-base translate-y-px" />
        </span>
      </div>
    </div>
  );
}
