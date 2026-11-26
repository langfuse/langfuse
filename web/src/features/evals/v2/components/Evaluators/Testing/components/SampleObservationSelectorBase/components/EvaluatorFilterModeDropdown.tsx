import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { SelectDropdown } from "@/src/components/design-system/SelectDropdown/SelectDropdown";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import { cn } from "@/src/utils/tailwind";

const FILTER_MODE_OPTIONS = [
  { value: "query", label: "Query" },
  { value: "builder", label: "Builder" },
] as const satisfies ReadonlyArray<{
  value: EvaluatorFilterExperience;
  label: string;
}>;

const triggerClassName =
  "text-foreground hover:bg-accent focus-visible:ring-ring inline-flex items-center gap-1 rounded px-1.5 py-1 focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50";

/** Query or builder for the evaluator observation filter. */
export function EvaluatorFilterModeDropdown({
  mode,
  onChange,
  size = "default",
}: {
  mode: EvaluatorFilterExperience;
  onChange: (mode: EvaluatorFilterExperience) => void;
  size?: "default" | "sm";
}) {
  return (
    <SelectDropdown
      aria-label="Filter editor mode"
      value={mode}
      options={FILTER_MODE_OPTIONS}
      onValueChange={onChange}
    >
      {({ getTriggerProps, selectedLabel }) => (
        <button
          {...getTriggerProps()}
          className={cn(
            triggerClassName,
            size === "sm" ? "h-7 text-xs" : "text-sm",
          )}
        >
          {selectedLabel}
          <DropdownIndicator />
        </button>
      )}
    </SelectDropdown>
  );
}
