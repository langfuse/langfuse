import type { ReactNode } from "react";

import { EvaluatorGallerySectionHeader } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGallerySectionHeader/EvaluatorGallerySectionHeader";

export function EvaluatorRecommendedCards({
  label,
  count,
  stickyHeader = false,
  children,
}: {
  label: string;
  count?: number;
  stickyHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="@container flex flex-col gap-3">
      <EvaluatorGallerySectionHeader label={label} sticky={stickyHeader}>
        {count != null ? (
          <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
            {count}
          </span>
        ) : null}
      </EvaluatorGallerySectionHeader>
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">{children}</div>
    </div>
  );
}
