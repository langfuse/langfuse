import { useState } from "react";
import { ChevronDown, InfoIcon } from "lucide-react";

import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";

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
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoIcon className="text-muted-foreground h-3.5 w-3.5 cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
        </Tooltip>
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
    <div className="flex flex-col gap-4">
      <button
        type="button"
        className="flex w-fit items-center gap-1.5 text-sm font-bold"
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
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <DescriptionLabel
              tooltip="How the score field is described to the judge."
              disabled={disabled}
            >
              Score description
            </DescriptionLabel>
            <Textarea
              className="min-h-16"
              placeholder="Describe what the score represents"
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
              placeholder="Describe what the reasoning should explain"
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
