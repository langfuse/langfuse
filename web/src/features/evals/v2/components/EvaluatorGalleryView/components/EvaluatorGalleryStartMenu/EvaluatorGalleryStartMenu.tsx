import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button } from "@/src/components/ui/button";
import { EvaluatorMethodTile } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";

export const EVALUATOR_START_OPTIONS = [
  {
    type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    title: "LLM-as-a-judge",
    description: "Explains each score. For nuanced inputs.",
  },
  {
    type: EvalTemplateTypeEnum.DECISION_MODEL,
    title: "Decision model",
    description: "Fast and cheap for simple questions.",
  },
  {
    type: EvalTemplateTypeEnum.CODE,
    title: "Code",
    description: "Exact rules, no model call.",
  },
] as const;

export function EvaluatorGalleryStartMenu({
  onCreateFromScratch,
}: {
  onCreateFromScratch: (type: EvalTemplateType) => void;
}) {
  return (
    <DropdownMenu
      ariaLabel="Start from scratch"
      placement="bottom-end"
      items={EVALUATOR_START_OPTIONS.map((option) => ({
        type: "item",
        id: option.type,
        title: option.title,
        description: option.description,
        leadingVisual: <EvaluatorMethodTile type={option.type} size="lg" />,
        onClick: () => onCreateFromScratch(option.type),
      }))}
    >
      {({ getTriggerProps }) => (
        <Button type="button" className="shrink-0 gap-1" {...getTriggerProps()}>
          Start from scratch
          <DropdownIndicator />
        </Button>
      )}
    </DropdownMenu>
  );
}
