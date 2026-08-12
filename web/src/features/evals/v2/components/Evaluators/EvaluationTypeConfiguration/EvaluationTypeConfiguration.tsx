import { type ReactNode } from "react";
import { InfoIcon } from "lucide-react";

import { type EvalTemplateType } from "@langfuse/shared";

import { Label } from "@/src/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
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
    <div className="flex flex-col gap-2">
      <Label className="flex items-center gap-1.5">
        Evaluation
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoIcon className="text-muted-foreground h-3.5 w-3.5 cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            How scores are produced: an LLM judging with a prompt, or your own
            Python or TypeScript code.
          </TooltipContent>
        </Tooltip>
      </Label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Run</span>
        <EvaluationTypeToggle
          value={mode}
          onValueChange={onModeChange}
          disabled={disabled}
        />
        <span>{mode === "CODE" ? "written in" : "with"}</span>
        {children}
      </div>
    </div>
  );
}
