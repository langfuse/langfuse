import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { EvaluatorGallerySectionHeader } from "@/src/features/evals/v2/components/EvaluatorGallerySectionHeader/EvaluatorGallerySectionHeader";
import { TileCard } from "@/src/components/TileCard/TileCard";

import { EvaluatorMethodTile } from "./components/EvaluatorMethodTile/EvaluatorMethodTile";
import { FeatureReleaseStatus } from "@/src/components/design-system/FeatureReleaseStatus/FeatureReleaseStatus";

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
    <TileCard
      size="sm"
      tile={<EvaluatorMethodTile type={option.type} />}
      title={
        <>
          {option.title}
          {"isNew" in option ? <EvaluatorNewBadge /> : null}
        </>
      }
      description={option.description}
      onClick={handleCreate}
    />
  );
}

function EvaluatorNewBadge() {
  return <FeatureReleaseStatus status="new" />;
}
