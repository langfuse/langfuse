import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { cn } from "@/src/utils/tailwind";
import {
  DEFAULT_REASONING_DESCRIPTION,
  DEFAULT_SCORE_DESCRIPTION,
} from "@/src/features/evals/v2/scoreOutputDefaults";

function DescriptionLabel({
  children,
  tooltip,
  disabled,
}: {
  children: string;
  tooltip: string;
  disabled: boolean;
}) {
  return (
    <Label className="flex items-center gap-1.5">
      {children}
      <span className="text-muted-foreground font-regular">(optional)</span>
      {!disabled ? (
        <InfoTooltip label={`About ${children.toLowerCase()}`}>
          {tooltip}
        </InfoTooltip>
      ) : null}
    </Label>
  );
}

export function ScoreOutputDescriptionFields({
  scoreDescription,
  reasoningDescription,
  onScoreDescriptionChange,
  onReasoningDescriptionChange,
  disabled,
  defaultAdvancedOpen = false,
}: {
  scoreDescription: string;
  reasoningDescription: string;
  onScoreDescriptionChange: (value: string) => void;
  onReasoningDescriptionChange: (value: string) => void;
  disabled: boolean;
  defaultAdvancedOpen?: boolean;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(defaultAdvancedOpen);

  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-1.5">
      <button
        type="button"
        className="col-span-2 flex w-fit items-center gap-1.5 text-sm font-bold"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((current) => !current)}
      >
        <ChevronDown
          className={cn(
            "text-muted-foreground h-4 w-4 transition-transform",
            !advancedOpen && "-rotate-90",
          )}
        />
        Advanced
      </button>

      {advancedOpen ? (
        <div className="col-start-2 mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <DescriptionLabel
              tooltip="Gives the judge context on what the score field should capture."
              disabled={disabled}
            >
              Score description
            </DescriptionLabel>
            <Textarea
              className="min-h-16"
              placeholder={DEFAULT_SCORE_DESCRIPTION}
              value={scoreDescription}
              disabled={disabled}
              onChange={(event) => onScoreDescriptionChange(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <DescriptionLabel
              tooltip="Tells the judge what its written reasoning should cover."
              disabled={disabled}
            >
              Reasoning description
            </DescriptionLabel>
            <Textarea
              className="min-h-16"
              placeholder={DEFAULT_REASONING_DESCRIPTION}
              value={reasoningDescription}
              disabled={disabled}
              onChange={(event) =>
                onReasoningDescriptionChange(event.target.value)
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
