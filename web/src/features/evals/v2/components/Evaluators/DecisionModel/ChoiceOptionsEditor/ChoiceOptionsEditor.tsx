import { DECISION_MODEL_LIMITS } from "@langfuse/shared";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { SortableList } from "@/src/features/evals/v2/components/SortableList/SortableList";
import { moveItem } from "@/src/features/evals/v2/fns/moveItem";

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
  const canRemove = options.length > DECISION_MODEL_LIMITS.minChoiceOptions;

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
      <SortableList
        items={options}
        getId={(_option, index) => `option-${index}`}
        getLabel={(option, index) => option.value || `option ${index + 1}`}
        onReorder={(from, to) => onChange(moveItem(options, from, to))}
        renderItem={(option, index) => (
          <div className="grid grid-cols-[minmax(8rem,1fr)_2fr_auto] items-center gap-2">
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
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="hover:text-destructive"
              disabled={!canRemove}
              onClick={() => remove(index)}
              title={
                canRemove
                  ? "Remove option"
                  : `Keep at least ${DECISION_MODEL_LIMITS.minChoiceOptions} options`
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      />
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
