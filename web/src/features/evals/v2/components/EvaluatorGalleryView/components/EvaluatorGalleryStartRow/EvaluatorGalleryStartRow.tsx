import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { Badge } from "@/src/components/design-system/Badge/Badge";

import { EvaluatorGallerySectionHeader } from "@/src/features/evals/v2/components/EvaluatorGallerySectionHeader/EvaluatorGallerySectionHeader";
import { cn } from "@/src/utils/tailwind";

import { EvaluatorMethodTile } from "./components/EvaluatorMethodTile/EvaluatorMethodTile";
import styles from "./EvaluatorGalleryStartRow.module.css";

const EVALUATOR_START_OPTIONS = [
  {
    type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    title: "LLM-as-a-judge",
    description: "Explains each score, for nuanced inputs.",
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

type EvaluatorGalleryStartRowProps = {
  onCreateFromScratch: (type: EvalTemplateType) => void;
};

/** The three blank evaluator types, always visible above the templates. */
export function EvaluatorGalleryStartRow({
  onCreateFromScratch,
}: EvaluatorGalleryStartRowProps) {
  return (
    <section className="flex flex-col gap-3">
      <EvaluatorGallerySectionHeader label="Start from scratch" />
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
        {EVALUATOR_START_OPTIONS.map((option) => (
          <StartOptionCard
            key={option.type}
            option={option}
            onCreateFromScratch={onCreateFromScratch}
          />
        ))}
      </div>
    </section>
  );
}

type StartOptionCardProps = {
  option: (typeof EVALUATOR_START_OPTIONS)[number];
  onCreateFromScratch: (type: EvalTemplateType) => void;
};

function StartOptionCard({
  option,
  onCreateFromScratch,
}: StartOptionCardProps) {
  const handleCreate = () => onCreateFromScratch(option.type);

  return (
    <button
      type="button"
      onClick={handleCreate}
      className={cn(
        styles.card,
        "bg-popover flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left",
      )}
    >
      <EvaluatorMethodTile type={option.type} />
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
  );
}

function EvaluatorNewBadge() {
  return <Badge text="NEW" color="green" font="mono" size="sm" />;
}
