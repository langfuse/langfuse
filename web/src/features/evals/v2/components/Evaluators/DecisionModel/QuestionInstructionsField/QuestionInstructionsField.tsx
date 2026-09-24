import { useId, useRef } from "react";
import { TriangleAlert } from "lucide-react";

import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { extractReferencedStateKeys } from "@/src/features/evals/v2/types/decisionModel";
import { cn } from "@/src/utils/tailwind";

/**
 * The plain-text question. Instructions never contain templates: the model
 * receives the state as a JSON object and the question names the field it is
 * about in backticks, so the field chips insert `` `key` `` at the cursor and
 * a reference to a key that no longer exists is flagged.
 */
export function QuestionInstructionsField({
  value,
  onChange,
  stateKeys,
  placeholder,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  stateKeys: string[];
  placeholder?: string;
  error?: string;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const referenced = extractReferencedStateKeys(value);
  const unknown = referenced.filter((key) => !stateKeys.includes(key));

  const insertKey = (key: string) => {
    const element = textareaRef.current;
    const token = `\`${key}\``;
    if (!element) {
      onChange(value ? `${value} ${token}` : token);
      return;
    }
    const start = element.selectionStart ?? value.length;
    const end = element.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const spacedBefore = before && !/\s$/.test(before) ? `${before} ` : before;
    const spacedAfter = after && !/^\s/.test(after) ? ` ${after}` : after;
    onChange(`${spacedBefore}${token}${spacedAfter}`);
    requestAnimationFrame(() => {
      const caret = spacedBefore.length + token.length;
      element.focus();
      element.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        Question
        <InfoTooltip label="About questions">
          Ask for one snap judgment a knowledgeable person makes in a second.
          Name the state field the question is about in backticks, for example
          “Does `question` request a refund?”. The model reads the state as a
          JSON object, so the question does not repeat the data.
        </InfoTooltip>
      </Label>
      <Textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        aria-invalid={Boolean(error) || unknown.length > 0}
        className={cn(error && "border-destructive")}
      />
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Fields:</span>
        {stateKeys.map((key) => {
          const used = referenced.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => insertKey(key)}
              title={`Insert \`${key}\` at the cursor`}
              className={cn(
                "rounded border px-1.5 py-0.5 font-mono transition-colors",
                used
                  ? "border-primary-accent/40 bg-primary-accent/10 text-primary-accent"
                  : "text-muted-foreground hover:bg-muted border-dashed",
              )}
            >
              {key}
            </button>
          );
        })}
        {unknown.map((key) => (
          <span
            key={key}
            className="text-dark-yellow flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5 font-mono"
            title={`\`${key}\` is not a state field`}
          >
            <TriangleAlert className="h-3 w-3" />
            {key}
          </span>
        ))}
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
