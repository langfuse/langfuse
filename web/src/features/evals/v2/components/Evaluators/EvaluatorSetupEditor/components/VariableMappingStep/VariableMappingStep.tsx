import type { ReactNode } from "react";

import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";

const COPY = {
  variables: {
    title: "Map variables to data",
    description:
      "Choose how observation fields populate each variable in your evaluation prompt. The live preview fills in real data so you can verify the mapping.",
  },
  state: {
    title: "Build the state",
    description:
      "Choose which observation fields the decision model sees, as one JSON object. Questions refer to these fields by name; the live preview shows the exact object sent.",
  },
} as const;

export function VariableMappingStep({
  open,
  onOpenChange,
  mappingEditor,
  variant = "variables",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mappingEditor: ReactNode;
  /** Prompt variables of an LLM judge, or the state of a decision model. */
  variant?: keyof typeof COPY;
}) {
  return (
    <Stepper
      number={2}
      title={COPY[variant].title}
      description={COPY[variant].description}
      open={open}
      onOpenChange={onOpenChange}
    >
      {mappingEditor}
    </Stepper>
  );
}
