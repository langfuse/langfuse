import { Braces, ListFilter } from "lucide-react";

import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import { cn } from "@/src/utils/tailwind";

export function FilterModeToggle({
  mode,
  onChange,
}: {
  mode: EvaluatorFilterExperience;
  onChange: (mode: EvaluatorFilterExperience) => void;
}) {
  return (
    <div
      className="bg-muted flex items-center rounded-md p-0.5"
      aria-label="Filter editor mode"
    >
      {(
        [
          { id: "query", label: "Query", icon: Braces },
          { id: "builder", label: "Builder", icon: ListFilter },
        ] as const
      ).map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={mode === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "text-muted-foreground flex h-7 items-center gap-1 rounded px-2 text-xs",
            mode === option.id && "bg-background text-foreground shadow-sm",
          )}
        >
          <option.icon className="h-3.5 w-3.5" aria-hidden="true" />
          {option.label}
        </button>
      ))}
    </div>
  );
}
