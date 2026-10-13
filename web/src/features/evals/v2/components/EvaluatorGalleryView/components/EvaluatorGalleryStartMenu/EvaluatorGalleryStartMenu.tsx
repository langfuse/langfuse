import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button } from "@/src/components/ui/button";
import { getEvaluatorMethodIcon } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";

const START_OPTIONS = [
  {
    type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    title: "LLM-as-a-judge",
    tooltip: "Explains each score. Best for long or nuanced inputs.",
  },
  {
    type: EvalTemplateTypeEnum.DECISION_MODEL,
    title: "Decision model",
    tooltip: "Fast and cheap at high volume, for simple questions.",
  },
  {
    type: EvalTemplateTypeEnum.CODE,
    title: "Code",
    tooltip: "Exact rules, no model call.",
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
      items={START_OPTIONS.map((option) => ({
        type: "item",
        id: option.type,
        title: option.title,
        tooltip: option.tooltip,
        icon: getEvaluatorMethodIcon(option.type),
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
