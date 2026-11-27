import { type ReactNode } from "react";

import { type EvalTemplateType } from "@langfuse/shared";

import { FieldRow } from "@/src/features/evals/v2/components/Evaluators/FieldRow/FieldRow";

import { EvaluationTypeToggle } from "./components/EvaluationTypeToggle/EvaluationTypeToggle";

/** Shared execution rows; the container owns which mode-specific selector fills the second one. */
export function EvaluationTypeConfiguration({
  mode,
  onModeChange,
  disabled,
  children,
}: {
  mode: EvalTemplateType;
  onModeChange: (mode: EvalTemplateType) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FieldRow label="Use">
        <EvaluationTypeToggle
          value={mode}
          onValueChange={onModeChange}
          disabled={disabled}
        />
      </FieldRow>
      <FieldRow label={mode === "CODE" ? "Language" : "Model"}>
        {children}
      </FieldRow>
    </div>
  );
}
