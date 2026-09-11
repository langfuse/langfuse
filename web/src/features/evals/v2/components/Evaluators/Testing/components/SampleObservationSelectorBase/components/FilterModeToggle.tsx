import { Braces, ListFilter } from "lucide-react";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";

export function FilterModeToggle({
  mode,
  onChange,
}: {
  mode: EvaluatorFilterExperience;
  onChange: (mode: EvaluatorFilterExperience) => void;
}) {
  return (
    <Tabs
      value={mode}
      onValueChange={(value) => onChange(value as EvaluatorFilterExperience)}
    >
      <Tabs.List aria-label="Filter editor mode" slidingIndicator>
        <Tabs.Trigger value="query" icon={Braces} label="Query" />
        <Tabs.Trigger value="builder" icon={ListFilter} label="Builder" />
      </Tabs.List>
    </Tabs>
  );
}
