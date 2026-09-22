import { DECISION_MODEL_LIMITS } from "@langfuse/shared";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";

export type ChoiceOptionDraft = { value: string; description: string };

/**
 * Options of a Choice question, one row each with the label and its
 * description side by side: descriptions sharpen the boundary between options,
 * so they stay visible rather than behind a popover.
 */
export function ChoiceOptionsEditor({
  options,
  onChange,
  error,
}: {
  options: ChoiceOptionDraft[];
  onChange: (options: ChoiceOptionDraft[]) => void;
  error?: string;
}) {
  const update = (index: number, next: Partial<ChoiceOptionDraft>) =>
    onChange(
      options.map((option, i) =>
        i === index ? { ...option, ...next } : option,
      ),
    );
  const remove = (index: number) =>
    onChange(options.filter((_, i) => i !== index));
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="flex items-center gap-1.5">
        Options
        <InfoTooltip label="About options">
          One label per option. A short description sharpens the boundary
          between options; add an “other” option when the list may not cover
          every input.
        </InfoTooltip>
        <span className="text-muted-foreground text-xs font-normal">
          {options.length} of {DECISION_MODEL_LIMITS.maxChoiceOptions}
        </span>
      </Label>
      <div className="flex flex-col gap-1.5">
        {options.map((option, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(8rem,1fr)_2fr_auto] items-start gap-2"
          >
            <Input
              value={option.value}
              onChange={(event) => update(index, { value: event.target.value })}
              placeholder="label"
              aria-label={`Option ${index + 1} label`}
              className="font-mono"
            />
            <Input
              value={option.description}
              onChange={(event) =>
                update(index, { description: event.target.value })
              }
              placeholder="What this option covers (optional)"
              aria-label={`Option ${index + 1} description`}
            />
            <RowActions
              onUp={index > 0 ? () => move(index, -1) : null}
              onDown={index < options.length - 1 ? () => move(index, 1) : null}
              onDelete={
                options.length > DECISION_MODEL_LIMITS.minChoiceOptions
                  ? () => remove(index)
                  : null
              }
            />
          </div>
        ))}
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={options.length >= DECISION_MODEL_LIMITS.maxChoiceOptions}
          onClick={() => onChange([...options, { value: "", description: "" }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add option
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

/** Move up / move down / remove for one row of an ordered list. */
export function RowActions({
  onUp,
  onDown,
  onDelete,
}: {
  onUp: (() => void) | null;
  onDown: (() => void) | null;
  onDelete: (() => void) | null;
}) {
  return (
    <span className="flex items-center">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={!onUp}
        onClick={onUp ?? undefined}
        title="Move up"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={!onDown}
        onClick={onDown ?? undefined}
        title="Move down"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="hover:text-destructive"
        disabled={!onDelete}
        onClick={onDelete ?? undefined}
        title="Remove"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
