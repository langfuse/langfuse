import { ChevronRight } from "lucide-react";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import type { ManagedTemplate } from "@/src/features/evals/v2/types/templateGallery";

const MAX_VISIBLE_SCORES = 2;

/** Sample `name: value` chips on a dot grid, styled like trace score badges. */
export function EvaluatorGalleryScorePreview({
  scores,
}: {
  scores: ManagedTemplate["previewScores"];
}) {
  const visibleScores = scores.slice(0, MAX_VISIBLE_SCORES);
  const hiddenCount = scores.length - visibleScores.length;

  return (
    <div
      aria-hidden="true"
      className="bg-muted-gray/70 dot-grid relative flex h-20 items-center justify-center gap-1 overflow-hidden rounded-sm px-3"
    >
      <div className="flex min-w-0 items-center justify-center gap-1 group-hover/card:blur-xs">
        {visibleScores.map((score) => (
          <span key={score.name} className="flex min-w-0 rounded-sm shadow-xs">
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
      <div className="bg-foreground/60 text-background absolute inset-0 hidden items-center justify-center gap-1 text-sm font-bold group-hover/card:flex">
        Use template
        <ChevronRight className="icon-base" />
      </div>
    </div>
  );
}
