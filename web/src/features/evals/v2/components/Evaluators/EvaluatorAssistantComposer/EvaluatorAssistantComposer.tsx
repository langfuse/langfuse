import type { KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

export function EvaluatorAssistantComposer({
  ariaLabel,
  value,
  placeholder,
  submitLabel,
  isSubmitting,
  autoFocus,
  onValueChange,
}: {
  ariaLabel: string;
  value: string;
  placeholder: string;
  submitLabel: string;
  isSubmitting: boolean;
  autoFocus: boolean;
  onValueChange: (value: string) => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const submitDisabled = !value.trim() || isSubmitting;

  return (
    <div
      role="group"
      aria-label="Evaluator request composer"
      aria-busy={isSubmitting}
      className="border-border-contrast bg-background ring-offset-background focus-within:ring-ring relative overflow-hidden rounded-md border shadow-xs transition-colors focus-within:ring-2 focus-within:ring-offset-2"
    >
      <Textarea
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        autoComplete="off"
        maxLength={2000}
        rows={5}
        placeholder={placeholder}
        value={value}
        disabled={isSubmitting}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className="ph-no-capture min-h-32 resize-y rounded-none border-0 pr-12 pb-12 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="absolute right-2 bottom-2 inline-flex rounded-full"
            tabIndex={submitDisabled ? 0 : undefined}
          >
            <Button
              type="submit"
              size="icon"
              aria-label={submitLabel}
              disabled={submitDisabled}
              loading={isSubmitting}
              className="size-8 shrink-0 rounded-full p-0"
            >
              <SendHorizontal className="size-3.5" aria-hidden="true" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{submitLabel}</TooltipContent>
      </Tooltip>
    </div>
  );
}
