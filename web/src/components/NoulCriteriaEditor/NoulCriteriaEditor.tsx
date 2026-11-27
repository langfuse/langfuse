import { useId, useState } from "react";
import { ChevronDown } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";

export type NoulCriteriaDraft = { true: string; false: string };
type NoulCriteriaErrors = Partial<Record<"true" | "false", string>>;

export type NoulCriteriaEditorProps = {
  criteria: NoulCriteriaDraft;
  onChange: (criteria: NoulCriteriaDraft) => void;
  errors?: NoulCriteriaErrors;
  yesPlaceholder?: string;
  noPlaceholder?: string;
  disabled?: boolean;
};

const DEFAULT_YES_PLACEHOLDER =
  "The user clearly asks for money back, a refund, or a chargeback.";
const DEFAULT_NO_PLACEHOLDER =
  "A complaint or question without asking for money back.";

/**
 * Optional refinement of a yes/no question. Collapsed by default: most
 * questions are clear without it, and the model returns P(true) either way.
 */
export function NoulCriteriaEditor({
  criteria,
  onChange,
  errors,
  yesPlaceholder = DEFAULT_YES_PLACEHOLDER,
  noPlaceholder = DEFAULT_NO_PLACEHOLDER,
  disabled = false,
}: NoulCriteriaEditorProps) {
  const id = useId();
  const hasContent = Boolean(criteria.true.trim() || criteria.false.trim());
  const hasErrors = Boolean(errors?.true || errors?.false);
  const [open, setOpen] = useState(hasContent || hasErrors);
  const isOpen = open || hasErrors;

  return (
    <div className="@container flex flex-col gap-2">
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto min-h-6 w-fit justify-start gap-x-1 pl-0 @max-sm/fields:flex-wrap"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        Refine what yes and no mean
        {/* One unit, so the chevron never wraps away from "(optional)". */}
        <span className="text-muted-foreground flex items-center gap-1 font-normal">
          (optional)
          <ChevronDown
            size="base"
            color="tertiary"
            __rawClassName={cn(
              "translate-y-px transition-transform",
              isOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </span>
      </Button>
      {isOpen ? (
        <div className="grid gap-3 @md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-true`}>Yes means</Label>
            <Textarea
              id={`${id}-true`}
              value={criteria.true}
              disabled={disabled}
              aria-invalid={Boolean(errors?.true)}
              className={cn(errors?.true && "border-destructive")}
              onChange={(event) =>
                onChange({ ...criteria, true: event.target.value })
              }
              placeholder={yesPlaceholder}
              rows={3}
            />
            {errors?.true ? (
              <p className="text-destructive text-xs">{errors.true}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-false`}>No means</Label>
            <Textarea
              id={`${id}-false`}
              value={criteria.false}
              disabled={disabled}
              aria-invalid={Boolean(errors?.false)}
              className={cn(errors?.false && "border-destructive")}
              onChange={(event) =>
                onChange({ ...criteria, false: event.target.value })
              }
              placeholder={noPlaceholder}
              rows={3}
            />
            {errors?.false ? (
              <p className="text-destructive text-xs">{errors.false}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
