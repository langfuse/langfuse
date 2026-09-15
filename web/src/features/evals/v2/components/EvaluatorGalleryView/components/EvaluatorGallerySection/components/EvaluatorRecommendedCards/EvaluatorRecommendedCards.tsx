import type { ReactNode } from "react";

import { EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY } from "@/src/features/evals/v2/constants/evaluatorGallery";
import { getGalleryCategoryPresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryCategoryPresentation";
import { cn } from "@/src/utils/tailwind";

export function EvaluatorRecommendedCards({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: ReactNode;
}) {
  const { icon: Icon, iconClassName } = getGalleryCategoryPresentation(
    EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
  );

  return (
    <div className="@container flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-3.5 w-3.5 shrink-0", iconClassName)} />
          <h4 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            {label}
          </h4>
          {count != null ? (
            <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
              {count}
            </span>
          ) : null}
        </div>
        <div className="border-t" />
      </div>
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">{children}</div>
    </div>
  );
}
