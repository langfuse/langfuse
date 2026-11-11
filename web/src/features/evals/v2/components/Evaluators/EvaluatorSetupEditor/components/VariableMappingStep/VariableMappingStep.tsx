import type { ReactNode } from "react";

import { Stepper } from "@/src/components/design-system/Stepper/Stepper";

const COPY = {
  variables: {
    title: "Map variables to data",
    description: undefined,
  },
  state: {
    title: "Build the state",
    description:
      "Choose which observation fields the decision model sees, as one JSON object. The live preview shows the exact object sent.",
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
