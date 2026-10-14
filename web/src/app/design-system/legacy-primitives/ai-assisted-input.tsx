import type { ComponentProps } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { Input } from "@/src/app/design-system/legacy-primitives/input";
import textShimmerStyles from "@/src/app/design-system/legacy-primitives/text-shimmer.module.css";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/app/design-system/legacy-primitives/tooltip";
import { cn } from "@/src/app/utils/tailwind";

type AIAssistedInputProps = Pick<
  ComponentProps<typeof Input>,
  "disabled" | "id" | "maxLength" | "onChange" | "placeholder" | "value"
> & {
  fieldName?: string;
  aiAssistance:
    | { state: "unavailable" }
    | { state: "idle"; onGenerate: () => void }
    | { state: "generating" };
};

export function AIAssistedInput({
  aiAssistance,
  disabled,
  fieldName = "name",
  placeholder,
  value,
  ...inputProps
}: AIAssistedInputProps) {
  const isAvailable = aiAssistance.state !== "unavailable";
  const isGenerating = aiAssistance.state === "generating";
  const generateLabel = value
    ? `Regenerate ${fieldName} with AI`
    : `Generate ${fieldName} with AI`;

  return (
    <div className="relative">
      <Input
        {...inputProps}
        value={value}
        placeholder={isGenerating ? "" : placeholder}
        disabled={disabled || isGenerating}
        aria-busy={isGenerating}
        className={cn(
          isAvailable && "pr-9",
          isGenerating && "border-primary/60 animate-pulse text-transparent",
        )}
      />
      {isGenerating ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-9 left-0 flex items-center overflow-hidden px-2 text-sm whitespace-nowrap"
        >
          <span className={textShimmerStyles.textShimmer}>
            Generating {fieldName}…
          </span>
        </span>
      ) : null}
      {isAvailable ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground absolute top-1 right-1"
              aria-label={isGenerating ? "Generating name" : generateLabel}
              disabled={isGenerating || disabled}
              onClick={
                aiAssistance.state === "idle"
                  ? aiAssistance.onGenerate
                  : undefined
              }
            >
              {isGenerating ? (
                <Loader2 className="icon-sm text-icon-foreground animate-spin" />
              ) : (
                <Sparkles className="icon-sm text-icon-foreground" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isGenerating ? `Generating ${fieldName}…` : generateLabel}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
