import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";

export type ChoiceOptionDraft = { value: string; description: string };

const HINT =
  "One label per option. A short description sharpens the boundary between options; add an “other” option when the list may not cover every input.";

/**
 * Options of a Choice question. `chips` keeps the compact category-chip look
 * of LLM-judge categorical scores and edits value + description in a popover;
 * `list` shows every option with its description inline, which reads better
 * once descriptions are the norm.
 */
export function ChoiceOptionsEditor({
  options,
  onChange,
  layout = "chips",
  error,
}: {
  options: ChoiceOptionDraft[];
  onChange: (options: ChoiceOptionDraft[]) => void;
  layout?: "chips" | "list";
  error?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
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
  const add = () => onChange([...options, { value: "", description: "" }]);

  return (
    <div className="flex flex-col gap-2">
      <Label className="flex items-center gap-1.5">
        Options
        <InfoTooltip label="About options">{HINT}</InfoTooltip>
        <span className="text-muted-foreground text-xs font-normal">
          {options.length} of 255
        </span>
      </Label>
      {layout === "chips" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {options.map((option, index) => {
            const empty = option.value.trim() === "";
            return (
              <OptionEditorPopover
                key={index}
                option={option}
                open={openIndex === index}
                onOpenChange={(open) => setOpenIndex(open ? index : null)}
                onChange={(next) => update(index, next)}
                onDelete={options.length > 2 ? () => remove(index) : null}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm transition-colors",
                      "hover:bg-muted/60 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
                      empty && "text-muted-foreground border-dashed italic",
                    )}
                    title={option.description || undefined}
                  >
                    <span className="font-mono">
                      {empty ? "new option" : option.value}
                    </span>
                    {option.description ? (
                      <span className="bg-muted-foreground/60 h-1.5 w-1.5 rounded-full" />
                    ) : null}
                  </button>
                </PopoverTrigger>
              </OptionEditorPopover>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              add();
              setOpenIndex(options.length);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add option
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {options.map((option, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(8rem,1fr)_2fr_auto] items-start gap-2"
            >
              <Input
                value={option.value}
                onChange={(event) =>
                  update(index, { value: event.target.value })
                }
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
                onDown={
                  index < options.length - 1 ? () => move(index, 1) : null
                }
                onDelete={options.length > 2 ? () => remove(index) : null}
              />
            </div>
          ))}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={add}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add option
            </Button>
          </div>
        </div>
      )}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

function OptionEditorPopover({
  children,
  option,
  open,
  onOpenChange,
  onChange,
  onDelete,
}: {
  children: ReactNode;
  option: ChoiceOptionDraft;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (next: Partial<ChoiceOptionDraft>) => void;
  onDelete: (() => void) | null;
}) {
  const id = useId();
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {children}
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-value`}>Label</Label>
            <Input
              id={`${id}-value`}
              value={option.value}
              onChange={(event) => onChange({ value: event.target.value })}
              placeholder="e.g. needs_revision"
              className="font-mono"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-description`}>
              Description{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id={`${id}-description`}
              value={option.description}
              onChange={(event) =>
                onChange({ description: event.target.value })
              }
              placeholder="What this option covers, and what it does not"
              rows={3}
            />
          </div>
          <div className="flex items-center justify-between">
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  onOpenChange(false);
                  onDelete();
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Remove
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
