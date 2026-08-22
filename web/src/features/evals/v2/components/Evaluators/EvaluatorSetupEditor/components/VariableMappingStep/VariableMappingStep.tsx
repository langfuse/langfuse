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
      description="Choose how observation fields populate each variable in your evaluation prompt. The live preview fills in real data so you can verify the mapping."
      open={open}
      onOpenChange={onOpenChange}
    >
      {mappingEditor}
    </Stepper>
  );
}
