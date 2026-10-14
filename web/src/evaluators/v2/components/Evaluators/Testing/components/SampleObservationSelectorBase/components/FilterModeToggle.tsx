import { Braces, ListFilter } from "lucide-react";

import { Tabs } from "@/src/app/design-system/Tabs/Tabs";
import type { EvaluatorFilterExperience } from "@/src/evaluators/v2/types/evaluatorFilterExperience";

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
      <Tabs.List variant="inset" size="md" aria-label="Filter editor mode">
        <Tabs.Trigger value="query" icon={Braces} label="Query" />
        <Tabs.Trigger value="builder" icon={ListFilter} label="Builder" />
      </Tabs.List>
    </Tabs>
  );
}
