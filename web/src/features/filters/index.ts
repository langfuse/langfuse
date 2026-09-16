// The filters feature's public surface (RFC rule 8). Named re-exports only —
// the filter builders, per-table filter configs and filter-state hooks other
// features already imported by file path.
//
// experiments' table filter-config stays on the deep path: filters' own
// useFilterState imports it, so routing it here would close a runtime cycle.
export { FilterToken } from "@/src/features/filters/components/FilterToken";
export {
  InlineFilterBuilder,
  InlineFilterState,
  PopoverFilterBuilder,
} from "@/src/features/filters/components/filter-builder";
export { MultiSelect } from "@/src/features/filters/components/multi-select";
// eval-logs / evaluators configs stay on the deep path: they import server
// table definitions (and Prisma enums via those), and re-exporting them here
// would make every consumer of this client door fail Vite/Storybook's
// `export * from "@prisma/client"` interop.
export {
  getMonitorFilterConfig,
  monitorFilterConfig,
} from "@/src/features/filters/config/monitors-config";
export { observationFilterConfig } from "@/src/features/filters/config/observations-config";
export { promptFilterConfig } from "@/src/features/filters/config/prompts-config";
export { SESSIONS_FIELD_REGISTRY } from "@/src/features/filters/config/sessionsSearchRegistry";
export { traceFilterConfig } from "@/src/features/filters/config/traces-config";
export { useColumnFilterState } from "@/src/features/filters/hooks/useColumnFilterState";
export { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
export {
  resolveCheckboxOperator,
  useSidebarFilterPresentation,
  useSidebarFilterState,
  useSidebarFilterStateCore,
} from "@/src/features/filters/hooks/useSidebarFilterState";
export type { UseSidebarFilterStateOptions } from "@/src/features/filters/hooks/useSidebarFilterState";
export { omitFilterFacets } from "@/src/features/filters/lib/filter-config";
export type { FilterConfig } from "@/src/features/filters/lib/filter-config";
export {
  normalizeFilterColumnNames,
  normalizeSingleValueOptions,
} from "@/src/features/filters/lib/filter-transform";
export { sortOptionValues } from "@/src/features/filters/lib/option-sort";
export { buildSidebarFilterSessionContextId } from "@/src/features/filters/lib/persistedSidebarFilterQuery";
