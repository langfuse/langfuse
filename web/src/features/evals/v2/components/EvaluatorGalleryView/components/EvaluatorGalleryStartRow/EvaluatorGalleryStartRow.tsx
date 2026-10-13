import type { EvalTemplateType } from "@langfuse/shared";

import { EvaluatorMethodTile } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";
import { EVALUATOR_START_OPTIONS } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryStartMenu/EvaluatorGalleryStartMenu";

/** The three blank evaluator types, always visible above the templates. */
export function EvaluatorGalleryStartRow({
  onCreateFromScratch,
}: {
  onCreateFromScratch: (type: EvalTemplateType) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-foreground text-base font-bold">
        Start from scratch
      </h4>
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
        {EVALUATOR_START_OPTIONS.map((option) => (
          <button
            key={option.type}
            type="button"
            onClick={() => onCreateFromScratch(option.type)}
            className="bg-background hover:shadow-card-hover flex cursor-pointer items-center gap-3 rounded-md border p-3 text-left"
          >
            <EvaluatorMethodTile type={option.type} size="lg" />
            <span className="flex min-w-0 flex-col">
              <span className="text-xs font-bold">{option.title}</span>
              <span className="text-muted-foreground text-xs">
                {option.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
