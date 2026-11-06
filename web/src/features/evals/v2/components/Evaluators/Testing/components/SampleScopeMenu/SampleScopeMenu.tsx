import { Check } from "@langfuse/icons";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import {
  DropdownMenuController,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { selectTriggerClassName } from "@/src/components/ui/select";
import { cn } from "@/src/utils/tailwind";

const OPTIONS = [
  { value: "observation", label: "Observation" },
  { value: "trace", label: "Trace" },
] as const;

/** Bordered Observation / Trace picker. Observation is first. */
export function SampleScopeMenu({
  value,
  onChange,
}: {
  value: "observation" | "trace";
  onChange: (value: "observation" | "trace") => void;
}) {
  const label = OPTIONS.find((option) => option.value === value)?.label;

  return (
    <DropdownMenuController
      align="start"
      renderMenu={() =>
        OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
          >
            <Check
              size="sm"
              color="default"
              __rawClassName={cn(
                "mr-2",
                option.value === value ? "opacity-100" : "opacity-0",
              )}
            />
            {option.label}
          </DropdownMenuItem>
        ))
      }
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <button
            type="button"
            className={cn(selectTriggerClassName, "w-auto shrink-0")}
            aria-label="Scope"
          >
            {label}
            <DropdownIndicator size="sm" />
          </button>
        </Trigger>
      )}
    </DropdownMenuController>
  );
}
