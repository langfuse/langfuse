import { type ComponentProps } from "react";
import { AsyncMultiSelectTagInput } from "@/src/components/design-system/AsyncMultiSelectTagInput/AsyncMultiSelectTagInput";
import { MAX_SELECTED_EXPERIMENTS } from "@/src/features/experiments/constants/comparison";

type TagInputProps = ComponentProps<typeof AsyncMultiSelectTagInput<string>>;

type ExperimentComparisonSelectProps = Pick<
  TagInputProps,
  "value" | "onValueChange" | "onAfterOpenChange"
> & {
  groups: NonNullable<TagInputProps["groups"]>;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isLoading: boolean;
  selectionLimitReached: boolean;
};

export function ExperimentComparisonSelect({
  groups,
  searchQuery,
  onSearchChange,
  isLoading,
  selectionLimitReached,
  ...selection
}: ExperimentComparisonSelectProps) {
  return (
    <AsyncMultiSelectTagInput
      {...selection}
      groups={groups}
      label="Compare"
      dropdownWidth="extra-wide"
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
  );
}
