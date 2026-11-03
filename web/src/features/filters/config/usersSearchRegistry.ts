import {
  createFieldRegistry,
  fieldRegistryFromColumns,
  EVENTS_FIELD_REGISTRY,
  type FieldRegistry,
} from "@/src/features/search-bar/lib/fields";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";

import { usersEventsFilterConfig, usersFilterConfig } from "./users-config";

/**
 * The Users bar is the Events bar with the facets the Users query cannot answer
 * removed — the same relationship the Users sidebar has to the Traces sidebar.
 * So its fields are taken from `EVENTS_FIELD_REGISTRY` rather than re-derived
 * from the column definitions: the events defs carry hand-tuned sync modes
 * (`name` searches as a substring even though its column is option-backed), and
 * re-deriving them would give the same token two different meanings depending on
 * which page you typed it into.
 *
 * The subset is keyed on the SIDEBAR's facets, which keeps the bar a subset of
 * the sidebar by construction: every field the bar can write, the sidebar can
 * show and remove.
 */
function usersFields(config: FilterConfig) {
  const exposed = new Set(config.facets.map((facet) => facet.column));
  return EVENTS_FIELD_REGISTRY.fields.filter((field) =>
    exposed.has(field.filterColumn ?? field.id),
  );
}

function usersColumns(config: FilterConfig) {
  const exposed = new Set(config.facets.map((facet) => facet.column));
  return config.columnDefinitions.filter((column) => exposed.has(column.id));
}

/**
 * Users grouped from the events read path.
 */
export const USERS_FIELD_REGISTRY: FieldRegistry = createFieldRegistry({
  id: "users",
  fields: usersFields(usersEventsFilterConfig),
  columns: usersColumns(usersEventsFilterConfig),
  metadata: true,
  // The users queries group `events_core` alone with no score join, so the
  // sidebar offers no score facet and the `scores.` namespace stays closed at
  // both levels. Leaving it open would let the bar write a filter that 500s.
  scores: false,
  traceScores: false,
  // A bare word is the user-id search the page has always had: `searchQuery`
  // lowers to `user_id ILIKE %q%` on this read path, so free text keeps its
  // own lane rather than being rewritten onto a column.
  allowFreeText: true,
  defaultTextField: null,
  freeTextScopeLabel: "user IDs",
  // Leads with a bare word: the substring user-id lookup is what this page is
  // searched for, and it is the one lane the `key:value` examples cannot show.
  searchExamples: ["alice", "level:ERROR", "-env:dev", "traceTags:billing"],
  hasExample: "sessionId",
  recentSearches: true,
  // No `buildFilterSystemPrompt` branch for this view yet, so Ask AI stays
  // hidden — the fallback prompt is the events one and would steer the model at
  // score columns this page cannot filter on. Write the branch, then flip this.
  aiFilterPrompt: false,
  aiContextFields: [
    { observedOptionsKey: "environment", promptLabel: "environment" },
    { observedOptionsKey: "userId", promptLabel: "userId (user)" },
    { observedOptionsKey: "traceName", promptLabel: "traceName" },
    { observedOptionsKey: "name", promptLabel: "name" },
    { observedOptionsKey: "traceTags", promptLabel: "traceTags (tags)" },
    { observedOptionsKey: "level", promptLabel: "level" },
  ],
});

export const LEGACY_USERS_FIELD_REGISTRY = fieldRegistryFromColumns(
  usersColumns(usersFilterConfig),
  {
    id: "users",
    metadata: true,
    scores: false,
    traceScores: false,
    allowFreeText: true,
    freeTextScopeLabel: "user IDs",
    searchExamples: ["alice", "-env:dev", "tags:billing"],
    fields: { environment: { aliases: ["env"] } },
  },
);
