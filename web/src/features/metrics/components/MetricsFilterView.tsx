import { startCase } from "lodash";
import { AlertCircle } from "lucide-react";

import {
  type ColumnDefinition,
  type FilterState,
  type SingleValueOption,
} from "@langfuse/shared";
import { type views } from "@langfuse/shared/query";
import { type z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import {
  mapViewFilterToUiTableFilter,
  partitionWidgetUiTableFiltersToView,
} from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";

/** MetricsFilterView renders the metric filter builder, translating between view-dimension space and UI-table labels and surfacing rows that are not valid for the view. */
export const MetricsFilterView = ({
  view,
  columns,
  columnsWithCustomSelect,
  stringObjectValueOptions,
  onStringObjectKeyChange,
  filters,
  onChange,
}: {
  view: z.infer<typeof views>;
  columns: ColumnDefinition[];
  columnsWithCustomSelect: string[];
  stringObjectValueOptions?: Record<string, SingleValueOption[]>;
  onStringObjectKeyChange?: (key: string) => void;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}) => {
  const editorFilters = viewFiltersToEditorFilters(view, filters);
  const unsupported = unsupportedViewFilters(view, filters);
  const unsupportedColumns = Array.from(
    new Set(unsupported.map((filter) => filter.column)),
  ).join(", ");

  return (
    <div className="space-y-2">
      {unsupported.length > 0 && (
        <Alert
          variant="default"
          className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20"
        >
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
          <AlertTitle className="text-yellow-800 dark:text-yellow-400">
            Unsupported legacy filters
          </AlertTitle>
          <AlertDescription className="text-yellow-700 dark:text-yellow-500">
            {`This still contains filter columns that are not supported for ${startCase(view)}: ${unsupportedColumns}. Remove them or switch to a compatible view before saving.`}
          </AlertDescription>
        </Alert>
      )}
      <InlineFilterBuilder
        columns={columns}
        filterState={editorFilters}
        onChange={(next: FilterState) =>
          onChange(editorFiltersToViewFilters(view, next))
        }
        columnsWithCustomSelect={columnsWithCustomSelect}
        stringObjectValueOptions={stringObjectValueOptions}
        onStringObjectKeyChange={onStringObjectKeyChange}
      />
    </div>
  );
};

/** viewFiltersToEditorFilters relabels canonical view-dimension rows into UI-table labels for the builder, preserving unmapped rows. */
const viewFiltersToEditorFilters = (
  view: z.infer<typeof views>,
  filters: FilterState,
): FilterState => {
  const { mappedFilters, unsupportedFilters } =
    partitionWidgetUiTableFiltersToView(view, filters);
  return [
    ...mapViewFilterToUiTableFilter(view, mappedFilters),
    ...unsupportedFilters,
  ];
};

/** editorFiltersToViewFilters canonicalizes edited UI-table rows back into view-dimension space, preserving unmapped rows. */
const editorFiltersToViewFilters = (
  view: z.infer<typeof views>,
  filters: FilterState,
): FilterState => {
  const { mappedFilters, unsupportedFilters } =
    partitionWidgetUiTableFiltersToView(view, filters);
  return [...mappedFilters, ...unsupportedFilters];
};

/** unsupportedViewFilters lists rows whose column is known but not valid for the view. */
const unsupportedViewFilters = (
  view: z.infer<typeof views>,
  filters: FilterState,
): FilterState =>
  partitionWidgetUiTableFiltersToView(view, filters).unsupportedFilters;

/** supportedViewFilters returns the canonical, query-ready rows for the view, stripping unsupported rows. */
export const supportedViewFilters = (
  view: z.infer<typeof views>,
  filters: FilterState,
): FilterState =>
  partitionWidgetUiTableFiltersToView(view, filters).mappedFilters;

/** getUnsupportedViewFilters exposes the unsupported partition so forms can gate save/query on legacy rows. */
export const getUnsupportedViewFilters = unsupportedViewFilters;

export const __test = {
  viewFiltersToEditorFilters,
  editorFiltersToViewFilters,
  unsupportedViewFilters,
};
