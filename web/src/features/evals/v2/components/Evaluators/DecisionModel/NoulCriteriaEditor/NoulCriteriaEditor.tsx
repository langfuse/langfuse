import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";

export type NoulCriteriaDraft = { true: string; false: string };

/**
 * Optional refinement of a yes/no question. Collapsed by default: most
 * questions are clear without it, and the model returns P(true) either way.
 */
export function NoulCriteriaEditor({
  criteria,
  onChange,
}: {
  criteria: NoulCriteriaDraft;
  onChange: (criteria: NoulCriteriaDraft) => void;
}) {
  const id = useId();
  const hasContent = Boolean(criteria.true.trim() || criteria.false.trim());
  const [open, setOpen] = useState(hasContent);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="link"
        size="sm"
        className="w-fit pl-0"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Refine what yes and no mean
        <span className="text-muted-foreground ml-1 font-normal">
          (optional)
        </span>
        <ChevronDown
          className={cn(
            "ml-1 h-4 w-4 transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </Button>
      {open ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-true`}>Yes means</Label>
            <Textarea
              id={`${id}-true`}
              value={criteria.true}
              onChange={(event) =>
                onChange({ ...criteria, true: event.target.value })
              }
              placeholder="The user clearly asks for money back, a refund, or a chargeback."
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-false`}>No means</Label>
            <Textarea
              id={`${id}-false`}
              value={criteria.false}
              onChange={(event) =>
                onChange({ ...criteria, false: event.target.value })
              }
              placeholder="A complaint or question without asking for money back."
              rows={3}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
