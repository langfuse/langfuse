import { type ReactNode } from "react";

import { type EvalTemplateType } from "@langfuse/shared";

import { EvaluationTypeToggle } from "./components/EvaluationTypeToggle/EvaluationTypeToggle";

/** Shared execution row; its container owns which mode-specific selector follows it. */
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
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Use</span>
      <EvaluationTypeToggle
        value={mode}
        onValueChange={onModeChange}
        disabled={disabled}
      />
      <span>{mode === "CODE" ? "written in" : "with"}</span>
      {children}
    </div>
  );
}
