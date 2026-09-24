// The filters feature's public surface (RFC rule 8). Named re-exports only —
// the filter builders, per-table filter configs and filter-state hooks other
// features already imported by file path.
//
// experiments' table filter-config stays on the deep path: filters' own
// useFilterState imports it, so routing it here would close a runtime cycle.
// events/config/filter-config stays on the deep path for the same reason
// against users-config.
export { FilterToken } from "@/src/features/filters/components/FilterToken";
export {
  InlineFilterBuilder,
  InlineFilterState,
  PopoverFilterBuilder,
} from "@/src/features/filters/components/filter-builder";
export { MultiSelect } from "@/src/features/filters/components/multi-select";
// eval-logs / evaluators / scores configs stay on the deep path: they import
// server table definitions (and Prisma enums via those), and re-exporting
// them here would make every consumer of this client door fail
// Vite/Storybook's `export * from "@prisma/client"` interop.
// users-config stays on the deep path: it imports events' filter-config, so
// routing it here would close a cycle through that module.
export {
  getMonitorFilterConfig,
  monitorFilterConfig,
} from "@/src/features/filters/config/monitors-config";
export {
  OBSERVATION_COLUMN_TO_BACKEND_KEY,
  getObservationsFilterConfig,
  observationFilterConfig,
} from "@/src/features/filters/config/observations-config";
export type { ObservationsOmittableFilterColumn } from "@/src/features/filters/config/observations-config";
export { promptFilterConfig } from "@/src/features/filters/config/prompts-config";
export {
  SESSION_COLUMN_TO_BACKEND_KEY,
  getSessionFilterConfig,
} from "@/src/features/filters/config/sessions-config";
export type { SessionOmittableFilterColumn } from "@/src/features/filters/config/sessions-config";
export {
  SESSIONS_FIELD_REGISTRY,
  sessionsFieldRegistry,
} from "@/src/features/filters/config/sessionsSearchRegistry";
export {
  getTraceFilterConfig,
  traceFilterConfig,
} from "@/src/features/filters/config/traces-config";
export type { TraceOmittableFilterColumn } from "@/src/features/filters/config/traces-config";
export {
  observationsFieldRegistry,
  tracesFieldRegistry,
} from "@/src/features/filters/config/tracingSearchRegistry";
export {
  LEGACY_USERS_FIELD_REGISTRY,
  USERS_FIELD_REGISTRY,
} from "@/src/features/filters/config/usersSearchRegistry";
export { useColumnFilterState } from "@/src/features/filters/hooks/useColumnFilterState";
export { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
export {
  decodeAndNormalizeFilters,
  resolveCheckboxOperator,
  useSidebarFilterPresentation,
  useSidebarFilterState,
  useSidebarFilterStateCore,
} from "@/src/features/filters/hooks/useSidebarFilterState";
export type {
  FacetOptions,
  UseSidebarFilterStateOptions,
} from "@/src/features/filters/hooks/useSidebarFilterState";
export { omitFilterFacets } from "@/src/features/filters/lib/filter-config";
export type { FilterConfig } from "@/src/features/filters/lib/filter-config";
export {
  normalizeFilterColumnNames,
  normalizeSingleValueOptions,
  transformFiltersForBackend,
} from "@/src/features/filters/lib/filter-transform";
export { sortOptionValues } from "@/src/features/filters/lib/option-sort";
export {
  buildSidebarFilterQueryStorageKey,
  buildSidebarFilterSessionContextId,
  readPersistedSidebarFilterQuery,
} from "@/src/features/filters/lib/persistedSidebarFilterQuery";
