import { DECISION_MODEL_LIMITS } from "@langfuse/shared";
import { Trash2 } from "@langfuse/icons";

import { TextActionButton } from "@/src/components/TextActionButton/TextActionButton";
import { Button } from "@/src/components/ui/button";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Input } from "@/src/components/ui/input";
import { FieldRow } from "@/src/features/evals/v2/components/Evaluators/FieldRow/FieldRow";
import { SortableList } from "@/src/components/design-system/SortableList/SortableList";
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
    <FieldRow
      label="Options"
      size="wide"
      align="start"
      hint={
        options.length >= 240
          ? `${options.length} of ${DECISION_MODEL_LIMITS.maxChoiceOptions}`
          : undefined
      }
      info={
        <InfoTooltip label="About options">
          One label per option. A short description sharpens the boundary
          between options; add an “other” option when the list may not cover
          every input.
        </InfoTooltip>
      }
    >
      <div className="flex flex-col gap-2">
        {options.length > 0 ? (
          <SortableList
            variant="table"
            items={options}
            getId={(_option, index) => `option-${index}`}
            getLabel={(option, index) => option.value || `option ${index + 1}`}
            onReorder={(from, to) => onChange(moveItem(options, from, to))}
            renderItem={(option, index) => (
              <div className="group/row grid grid-cols-[minmax(8rem,1fr)_2fr_auto] items-center gap-2">
                <Input
                  value={option.value}
                  onChange={(event) =>
                    update(index, { value: event.target.value })
                  }
                  placeholder="label"
                  aria-label={`Option ${index + 1} label`}
                  className="h-8 border-transparent bg-transparent px-1 font-mono text-ellipsis shadow-none placeholder:text-ellipsis"
                />
                <Input
                  value={option.description}
                  onChange={(event) =>
                    update(index, { description: event.target.value })
                  }
                  placeholder="What this option covers (optional)"
                  aria-label={`Option ${index + 1} description`}
                  className="text-muted-foreground h-8 border-transparent bg-transparent px-1 text-ellipsis shadow-none placeholder:text-ellipsis"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="hover:text-destructive opacity-100 group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:hover)]:opacity-0"
                  disabled={!canRemove}
                  onClick={() => remove(index)}
                  title={
                    canRemove
                      ? "Remove option"
                      : `Keep at least ${DECISION_MODEL_LIMITS.minChoiceOptions} options`
                  }
                >
                  <Trash2 size="sm" color="default" />
                </Button>
              </div>
            )}
          />
        ) : null}
        <TextActionButton
          text="Add option"
          disabled={options.length >= DECISION_MODEL_LIMITS.maxChoiceOptions}
          onClick={() => onChange([...options, { value: "", description: "" }])}
        />
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    </FieldRow>
  );
}
