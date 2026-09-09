// The search-bar feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
//
// filters/config/sessionsSearchRegistry stays on the deep path: it is imported
// by a module this index transitively reaches, so routing it through here
// would close a runtime cycle.
export { ComposerTokens } from "@/src/features/search-bar/components/ComposerTokens";
export { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
export {
  COMPOSER_SURFACE_CLASSES,
  COMPOSER_TEXT_CLASSES,
} from "@/src/features/search-bar/components/composer-chrome";
export { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
export { useSearchBarEnabled } from "@/src/features/search-bar/hooks/useSearchBarEnabled";
export { astToFilterState } from "@/src/features/search-bar/lib/adapter";
export { buildAiContext } from "@/src/features/search-bar/lib/ai-context";
export {
  DEFAULT_SEARCH_TYPE,
  planCommit,
} from "@/src/features/search-bar/lib/commit";
export type { QueryPresetSection } from "@/src/features/search-bar/lib/completions";
export {
  EVENTS_FIELD_REGISTRY,
  extendFieldRegistryWithColumns,
  fieldRegistryFromColumns,
  resolveField,
  withFieldOptions,
} from "@/src/features/search-bar/lib/fields";
export type { FieldRegistry } from "@/src/features/search-bar/lib/fields";
export { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
export {
  observedScoreNamesFromOptions,
  toObservedOptions,
  withMetadataPathOptions,
} from "@/src/features/search-bar/lib/observed-options";
export type { ObservedOptions } from "@/src/features/search-bar/lib/observed-options";
export { filterRank } from "@/src/features/search-bar/lib/rank";
export { validateQuery } from "@/src/features/search-bar/lib/validate";
