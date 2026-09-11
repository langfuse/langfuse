import type { ColumnDefinition } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import { providerLabels } from "./providerLabels";

const filterColumns: ColumnDefinition[] = [
  {
    name: "Provider",
    id: "provider",
    type: "arrayOptions",
    internal: "provider",
    options: Object.entries(providerLabels).map(([value, displayValue]) => ({
      value,
      displayValue,
    })),
  },
  {
    name: "API format",
    id: "apiFormat",
    type: "arrayOptions",
    internal: "apiFormat",
    options: [],
  },
];

export const gatewayModelsFilterConfig: FilterConfig = {
  tableName: "gateway-models",
  columnDefinitions: filterColumns,
  defaultExpanded: ["provider", "apiFormat"],
  facets: [
    { type: "categorical", column: "provider", label: "Provider" },
    { type: "categorical", column: "apiFormat", label: "API format" },
  ],
};
