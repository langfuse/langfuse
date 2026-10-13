import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { Badge } from "@/src/components/design-system/Badge/Badge";

import { EvaluatorGallerySectionHeader } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGallerySectionHeader/EvaluatorGallerySectionHeader";
import { EvaluatorMethodTile } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";

const EVALUATOR_START_OPTIONS = [
  {
    type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    title: "LLM-as-a-judge",
    description: "Explains each score. For nuanced inputs.",
  },
  {
    type: EvalTemplateTypeEnum.DECISION_MODEL,
    title: "Decision model",
    isNew: true,
    description: "Fast and cheap for simple questions.",
  },
  {
    type: EvalTemplateTypeEnum.CODE,
    title: "Code",
    description: "Exact rules, no model call.",
  },
] as const;

function EvaluatorNewBadge() {
  return <Badge text="NEW" color="green" font="mono" size="sm" />;
}

/** The three blank evaluator types, always visible above the templates. */
export function EvaluatorGalleryStartRow({
  onCreateFromScratch,
}: {
  onCreateFromScratch: (type: EvalTemplateType) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <EvaluatorGallerySectionHeader label="Start from scratch" sticky />
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
              <span className="flex items-center gap-1.5 text-xs font-bold">
                {option.title}
                {"isNew" in option ? <EvaluatorNewBadge /> : null}
              </span>
              <span
                className="text-muted-foreground truncate text-xs"
                title={option.description}
              >
                {option.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
