import { useRef } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";

/** Compact title-bar editor for the evaluator name used on save and scores. */
export function EvaluatorTitleEditor({
  scoreName,
  onScoreNameChange,
}: {
  scoreName: string;
  onScoreNameChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Input
        ref={inputRef}
        aria-label="Evaluator name"
        className="placeholder:text-foreground [field-sizing:content] h-7 max-w-full border-0 bg-transparent px-0 py-0 text-lg leading-7 font-bold shadow-none focus-visible:ring-0"
        placeholder="Untitled"
        title="This name is also used for scores created by the evaluator."
        value={scoreName}
        onChange={(event) => onScoreNameChange(event.target.value)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Edit evaluator name"
        title="Edit evaluator name"
        onClick={() => inputRef.current?.focus()}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
