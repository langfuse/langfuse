// The search-bar feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
//
// filters/config/sessionsSearchRegistry stays on the deep path: it is imported
// by a module this index transitively reaches, so routing it through here
// would close a runtime cycle.
export { ComposerTokens } from "./components/ComposerTokens";
export { EventsSearchBarRow } from "./components/EventsSearchBarRow";
export { TableSearchBar } from "./components/TableSearchBar";
export {
  COMPOSER_SURFACE_CLASSES,
  COMPOSER_TEXT_CLASSES,
} from "./components/composer-chrome";
export { useEventsSearchBar } from "./hooks/useEventsSearchBar";
export { useSearchBarEnabled } from "./hooks/useSearchBarEnabled";
export { astToFilterState } from "./lib/adapter";
export { buildAiContext } from "./lib/ai-context";
export { planCommit } from "./lib/commit";
export type { QueryPresetSection } from "./lib/completions";
export {
  EVENTS_FIELD_REGISTRY,
  extendFieldRegistryWithColumns,
  fieldRegistryFromColumns,
  resolveField,
  withFieldOptions,
} from "./lib/fields";
export type { FieldRegistry } from "./lib/fields";
export { filterStateToQueryText } from "./lib/filter-state-to-query";
export {
  observedScoreNamesFromOptions,
  toObservedOptions,
  withMetadataPathOptions,
} from "./lib/observed-options";
export type { ObservedOptions } from "./lib/observed-options";
export { filterRank } from "./lib/rank";
export { validateQuery } from "./lib/validate";
