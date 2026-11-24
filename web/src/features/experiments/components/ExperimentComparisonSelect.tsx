import { type ComponentProps, useId } from "react";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { AsyncMultiSelectTagInput } from "@/src/components/design-system/AsyncMultiSelectTagInput/AsyncMultiSelectTagInput";
import { MAX_SELECTED_EXPERIMENTS } from "@/src/features/experiments/constants/comparison";

type TagInputProps = ComponentProps<typeof AsyncMultiSelectTagInput<string>>;

type ExperimentComparisonSelectProps = Pick<
  TagInputProps,
  "value" | "onValueChange" | "onOpenChange"
> & {
  groups: NonNullable<TagInputProps["groups"]>;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isLoading: boolean;
  selectionLimitReached: boolean;
  isAutoSelectEnabled: boolean;
  onAutoSelectEnabledChange: (enabled: boolean) => void;
};

export function ExperimentComparisonSelect({
  groups,
  searchQuery,
  onSearchChange,
  isLoading,
  selectionLimitReached,
  isAutoSelectEnabled,
  onAutoSelectEnabledChange,
  ...selection
}: ExperimentComparisonSelectProps) {
  const autoSelectId = useId();
  return (
    <div className="space-y-2">
      <AsyncMultiSelectTagInput
        {...selection}
        groups={groups}
        label="Compare"
        search={{
          placeholder: "Search experiments...",
          value: searchQuery,
          onValueChange: onSearchChange,
        }}
        emptyMessage="No experiments found"
        loading={isLoading ? { message: "Loading experiments..." } : undefined}
        placeholder={
          selectionLimitReached
            ? `Max ${MAX_SELECTED_EXPERIMENTS} experiments`
            : "Search experiments..."
        }
      />
      <label
        htmlFor={autoSelectId}
        className="flex cursor-pointer items-center gap-2 text-xs"
      >
        <Checkbox
          id={autoSelectId}
          size="sm"
          checked={isAutoSelectEnabled}
          onCheckedChange={(checked) =>
            onAutoSelectEnabledChange(checked === true)
          }
        />
        Auto-select a comparison experiment by default
      </label>
    </div>
  );
}
