import { useStore } from "zustand";
import { Check } from "@langfuse/icons";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import {
  DropdownMenuController,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { selectTriggerClassName } from "@/src/components/ui/select";
import type {
  EvaluatorSetupStore,
  SamplePresentation,
} from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { cn } from "@/src/utils/tailwind";

const OPTIONS: Array<{ value: SamplePresentation; label: string }> = [
  { value: "table", label: "Option A" },
  { value: "detail", label: "Option B" },
];

/** Page-header switch between the matching table and the single-trace view. */
export function SamplePresentationMenu({
  store,
}: {
  store: EvaluatorSetupStore;
}) {
  const value = useStore(store, (state) => state.samplePresentation);
  const label = OPTIONS.find((option) => option.value === value)?.label;

  return (
    <PageHeaderControlsPortal>
      <DropdownMenuController
        align="end"
        renderMenu={() =>
          OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() =>
                store.getState().actions.setSamplePresentation(option.value)
              }
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
              aria-label="Sample view"
            >
              {label}
              <DropdownIndicator size="sm" />
            </button>
          </Trigger>
        )}
      </DropdownMenuController>
    </PageHeaderControlsPortal>
  );
}
