import type { ReactNode } from "react";

import { EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY } from "@/src/features/evals/v2/constants/evaluatorGallery";
import { getGalleryCategoryPresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryCategoryPresentation";
import { cn } from "@/src/utils/tailwind";

export function EvaluatorRecommendedCards({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const { icon: Icon, iconClassName } = getGalleryCategoryPresentation(
    EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
  );

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-muted-foreground flex items-center gap-1.5 text-xs font-bold">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", iconClassName)} />
        {label}
      </h4>
      <div className="grid grid-cols-3 gap-3">{children}</div>
    </div>
  );
}
