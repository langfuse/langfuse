import { EvalTemplateTypeEnum } from "@langfuse/shared";

import { cn } from "@/src/utils/tailwind";
import { EvaluatorTypeBadge } from "@/src/features/evals/v2/components/Evaluators/EvaluatorTypeBadge/EvaluatorTypeBadge";
import {
  GALLERY_TEMPLATE_RUNS_ON_LABELS,
  getGalleryTemplatePresentation,
} from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";

export function EvaluatorRecommendedCard({
  template,
  onSelect,
}: {
  template: GalleryTemplate;
  onSelect: (template: GalleryTemplate) => void;
}) {
  const {
    description,
    type,
    icon: Icon,
    runsOn,
  } = getGalleryTemplatePresentation(template);

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className="hover:border-primary hover:bg-accent/40 flex min-h-40 cursor-pointer flex-col gap-3 rounded-lg border p-4 text-left transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            type === EvalTemplateTypeEnum.CODE
              ? "bg-light-blue/40 text-dark-blue"
              : "bg-light-violet text-dark-violet",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <EvaluatorTypeBadge type={type} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-bold" title={template.name}>
          {template.name}
        </span>
        <p
          className="text-muted-foreground line-clamp-2 text-sm leading-relaxed"
          title={description}
        >
          {description}
        </p>
      </div>
      {runsOn?.length ? (
        <p className="text-muted-foreground mt-auto border-t pt-3 text-xs">
          Runs on{" "}
          {runsOn
            .map((target) => GALLERY_TEMPLATE_RUNS_ON_LABELS[target])
            .join(" · ")}
        </p>
      ) : null}
    </button>
  );
}
