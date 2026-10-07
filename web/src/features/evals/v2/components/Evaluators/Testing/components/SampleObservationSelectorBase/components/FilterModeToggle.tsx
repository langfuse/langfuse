import { Braces, ListFilter } from "lucide-react";

import { ToggleGroup } from "@/src/components/design-system/ToggleGroup/ToggleGroup";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";

export function FilterModeToggle({
  mode,
  onChange,
}: {
  mode: EvaluatorFilterExperience;
  onChange: (mode: EvaluatorFilterExperience) => void;
}) {
  return (
    <ToggleGroup
      value={mode}
      onValueChange={(value) => onChange(value as EvaluatorFilterExperience)}
    >
      <ToggleGroup.List aria-label="Filter editor mode">
        <ToggleGroup.Trigger value="query" icon={Braces} label="Query" />
        <ToggleGroup.Trigger
          value="builder"
          icon={ListFilter}
          label="Builder"
        />
      </ToggleGroup.List>
    </ToggleGroup>
  );
}
