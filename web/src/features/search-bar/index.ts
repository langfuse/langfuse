// The search-bar feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
//
// filters' sessions/users/tracing search registries keep importing
// `lib/fields` by file path: they live on the filters door, and this
// index re-exports ComposerTokens which already imports that door, so
// routing those registries through here would close a runtime cycle.
export { ComposerTokens } from "@/src/features/search-bar/components/ComposerTokens";
export { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
export { TableSearchBar } from "@/src/features/search-bar/components/TableSearchBar";
export {
  COMPOSER_SURFACE_CLASSES,
  COMPOSER_TEXT_CLASSES,
} from "@/src/features/search-bar/components/composer-chrome";
export { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
export { useSearchBarEnabled } from "@/src/features/search-bar/hooks/useSearchBarEnabled";
export { useFullTextSearch } from "@/src/features/search-bar/hooks/useFullTextSearch";
export { astToFilterState } from "@/src/features/search-bar/lib/adapter";
export { buildAiContext } from "@/src/features/search-bar/lib/ai-context";
export { planCommit } from "@/src/features/search-bar/lib/commit";
export {
  applyPick,
  planInputCompletions,
} from "@/src/features/search-bar/lib/completions";
export type { QueryPresetSection } from "@/src/features/search-bar/lib/completions";
export {
  EVENTS_FIELD_REGISTRY,
  createFieldRegistry,
  extendFieldRegistryWithColumns,
  fieldRegistryFromColumns,
  resolveField,
  withFieldOptions,
} from "@/src/features/search-bar/lib/fields";
export type { FieldRegistry } from "@/src/features/search-bar/lib/fields";
export { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
export { parse } from "@/src/features/search-bar/lib/langQ";
export {
  observedScoreNamesFromOptions,
  toObservedOptions,
  withMetadataPathOptions,
} from "@/src/features/search-bar/lib/observed-options";
export type { ObservedOptions } from "@/src/features/search-bar/lib/observed-options";
export { filterRank } from "@/src/features/search-bar/lib/rank";
export { runSearchBarInvariants } from "@/src/features/search-bar/lib/searchBarInvariants";
export { validateQuery } from "@/src/features/search-bar/lib/validate";
export { createSearchBarStore } from "@/src/features/search-bar/store/searchBarStore";
