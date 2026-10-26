import { useId } from "react";

import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";

/**
 * Plain question text for OpenAI decisions. The API has no variable syntax;
 * the mapped `input` object is the only evidence the model receives.
 */
export function OpenAIQuestionInstructions({
  value,
  onChange,
  placeholder,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        Question
        <InfoTooltip label="About questions">
          Ask for one snap judgment. This text is sent as written. The model
          reads the input object, so the question does not insert fields.
        </InfoTooltip>
      </Label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        aria-invalid={Boolean(error)}
        className={cn(error && "border-destructive")}
      />
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
