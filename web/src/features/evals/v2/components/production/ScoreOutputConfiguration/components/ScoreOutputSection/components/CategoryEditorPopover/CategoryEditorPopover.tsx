import { type ReactNode } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { type ScoreOutputChoice } from "@/src/features/evals/v2/scoreOutputTypes";
import { cn } from "@/src/utils/tailwind";

function CategoryEditorPopoverController({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {children}
    </Popover>
  );
}

/** Edits one categorical score option inside a controlled popover. */
export function CategoryEditorPopover({
  trigger,
  title,
  idSuffix,
  choice,
  open,
  onOpenChange,
  onChange,
  onDelete,
  onDone,
}: {
  trigger: ReactNode;
  title: string;
  idSuffix: string;
  choice: ScoreOutputChoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (next: Partial<ScoreOutputChoice>) => void;
  onDelete: (() => void) | null;
  onDone: () => void;
}) {
  return (
    <CategoryEditorPopoverController open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-bold">{title}</p>
            <p className="text-muted-foreground text-xs">
              Set the returned label and its optional numeric score.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`score-output-category-${idSuffix}`}>
              Category
            </Label>
            <Input
              id={`score-output-category-${idSuffix}`}
              placeholder="Category label"
              value={choice.label}
              onChange={(event) => onChange({ label: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`score-output-category-value-${idSuffix}`}>
              Numeric score
            </Label>
            <Input
              id={`score-output-category-value-${idSuffix}`}
              type="number"
              placeholder="Optional"
              value={choice.value}
              onChange={(event) => onChange({ value: event.target.value })}
            />
          </div>
          <div
            className={cn(
              "flex items-center",
              onDelete ? "justify-between" : "justify-end",
            )}
          >
            {onDelete ? (
              <PopoverClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  aria-label="Delete category"
                  title="Delete category"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </PopoverClose>
            ) : null}
            <PopoverClose asChild>
              <Button type="button" size="sm" onClick={onDone}>
                Done
              </Button>
            </PopoverClose>
          </div>
        </div>
      </PopoverContent>
    </CategoryEditorPopoverController>
  );
}
