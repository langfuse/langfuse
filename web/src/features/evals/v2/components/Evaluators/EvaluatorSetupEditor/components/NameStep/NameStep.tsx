import type { ComponentProps } from "react";

import { AIAssistedInput } from "@/src/components/ui/ai-assisted-input";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";

export function NameStep({
  step,
  open,
  onOpenChange,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  nameAIAssistance,
}: {
  step: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (name: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  nameAIAssistance: ComponentProps<typeof AIAssistedInput>["aiAssistance"];
}) {
  return (
    <Stepper
      number={step}
      title="Name evaluator"
      description="Give the evaluator a clear name (it's also used as the score name) and explain when it should be used."
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="evaluator-name" className="flex items-center gap-1.5">
            Name
            <InfoTooltip label="About evaluator names">
              The evaluator name is also used as the score name for the scores
              it produces.
            </InfoTooltip>
          </Label>
          <AIAssistedInput
            id="evaluator-name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={
              nameAIAssistance.state === "generating"
                ? "Generating a name…"
                : "Evaluator name"
            }
            aiAssistance={nameAIAssistance}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="evaluator-description">
            Description{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="evaluator-description"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Describe what this evaluator measures"
          />
        </div>
      </div>
    </Stepper>
  );
}
