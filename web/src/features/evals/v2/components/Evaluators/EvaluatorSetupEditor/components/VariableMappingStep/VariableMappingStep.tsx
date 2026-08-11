import type { ReactNode } from "react";

import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";

export function VariableMappingStep({
  open,
  onOpenChange,
  mappingEditor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mappingEditor: ReactNode;
}) {
  return (
    <Stepper
      number={2}
      title="Map variables to data"
      description="Configure how observation data maps to variables in your evaluator prompt. Use the sample observation to preview and verify the mapping."
      open={open}
      onOpenChange={onOpenChange}
    >
      {mappingEditor}
    </Stepper>
  );
}
