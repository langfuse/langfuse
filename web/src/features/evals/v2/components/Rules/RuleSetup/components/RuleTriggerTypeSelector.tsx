import { Activity, Gauge } from "lucide-react";
import { EvalTargetObject } from "@langfuse/shared";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { SelectionCardRadioGroup } from "@/src/components/design-system/SelectionCardRadioGroup/SelectionCardRadioGroup";
import type { RuleDraft } from "@/src/features/evals/v2/types/rules";

const TRIGGER_OPTIONS = [
  {
    value: EvalTargetObject.EVENT,
    icon: Activity,
    title: "Incoming observations",
    summary: "Run when an observation is ingested.",
    example: "Every root span in production",
  },
  {
    value: EvalTargetObject.SCORE_RESULT,
    icon: Gauge,
    title: "Evaluator results",
    summary: "Run when another evaluator returns a matching score.",
    example: "When relevance drops below 0.5",
    headerAdornment: (
      <span className="ml-auto">
        <Badge text="Experimental" color="yellow" size="sm" />
      </span>
    ),
  },
] as const;

export function RuleTriggerTypeSelector({
  value,
  onValueChange,
}: {
  value: RuleDraft["targetObject"];
  onValueChange: (value: RuleDraft["targetObject"]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm">Trigger on</p>
      <SelectionCardRadioGroup<RuleDraft["targetObject"]>
        ariaLabel="Trigger on"
        columns={2}
        options={TRIGGER_OPTIONS}
        value={value}
        onValueChange={onValueChange}
      />
    </div>
  );
}
