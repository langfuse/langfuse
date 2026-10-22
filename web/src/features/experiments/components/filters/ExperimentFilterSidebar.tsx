import { type ComponentProps } from "react";
import { type FilterState } from "@langfuse/shared";
import { useDataTableControls } from "@/src/components/table/data-table-controls";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { ExperimentFilterSidebarView } from "./ExperimentFilterSidebarView";
import { editExperimentFilter } from "./experimentFilterEditing";

/** Applied conditions belong to the host; this boundary supplies context and analytics. */
export function ExperimentFilterSidebar({
  filters,
  onChange,
  onClearAll,
  targets,
  options,
  legacyDefaultTarget,
  optionsError,
  onRetryOptions,
  layout = "panel",
}: ExperimentFilterSidebarProps) {
  const { open, setOpen, isMobile } = useDataTableControls();
  const capture = usePostHogClientCapture();

  function handleApply(filter: FilterState[number], index?: number) {
    const next =
      index === undefined
        ? [...filters, filter]
        : editExperimentFilter(filters, index, filter);
    if (JSON.stringify(next) === JSON.stringify(filters)) return;
    onChange(next);
    const target = filter.target ?? legacyDefaultTarget;
    capture("filters:applied", {
      surface: "sidebar",
      tableName: "experiment-items",
      isV4: true,
      column: filter.column,
      filterType: filter.type,
      operator: filter.operator,
      conditionCount: next.length,
      columnConditionCount: next.filter(
        (entry) => entry.column === filter.column,
      ).length,
      valueCount: Array.isArray(filter.value) ? filter.value.length : 1,
      targetKind:
        target === "all" || target === "baseline" ? target : "experiment",
    });
  }

  function handleRemove(index: number) {
    onChange(editExperimentFilter(filters, index, null));
    capture("filters:cleared", {
      surface: "sidebar",
      tableName: "experiment-items",
      isV4: true,
      scope: "facet",
      column: filters[index].column,
      clearedCount: 1,
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    capture("filters:sidebar_toggled", {
      tableName: "experiment-items",
      isV4: true,
      open: nextOpen,
      trigger: "header",
    });
  }

  function handleActiveOnlyChange(enabled: boolean) {
    capture("filters:active_only_toggled", {
      tableName: "experiment-items",
      isV4: true,
      enabled,
    });
  }

  return (
    <ExperimentFilterSidebarView
      filters={filters}
      onApply={handleApply}
      onRemove={handleRemove}
      onClearAll={onClearAll}
      targets={targets}
      options={options}
      legacyDefaultTarget={legacyDefaultTarget}
      optionsError={optionsError}
      onRetryOptions={onRetryOptions}
      layout={layout}
      isCollapsed={layout === "panel" && !isMobile && !open}
      onOpenChange={handleOpenChange}
      onActiveOnlyChange={handleActiveOnlyChange}
    />
  );
}

type ExperimentFilterSidebarProps = Pick<
  ComponentProps<typeof ExperimentFilterSidebarView>,
  | "filters"
  | "onClearAll"
  | "targets"
  | "options"
  | "legacyDefaultTarget"
  | "optionsError"
  | "onRetryOptions"
> & { onChange: (filters: FilterState) => void; layout?: "panel" | "inline" };
