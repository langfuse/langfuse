import {
  fieldRegistryFromColumns,
  SCORE_COLUMNS,
  type FieldRegistry,
} from "@/src/features/search-bar/lib/fields";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";

import { sessionEventsFilterConfig } from "./sessions-config";

/**
 * The bar's field list is derived from the sidebar's FACETS, not from the raw
 * `ColumnDefinition[]`. The facet list is the view's curated filter surface;
 * the column list also carries internals the sidebar never offers (`usage`
 * duplicates `totalTokens`, `createdAt` is owned by the time-range picker,
 * `bookmarked` was retired from the UI). Deriving from facets keeps the bar a
 * subset of the sidebar by construction — the invariant that makes saved views
 * round-trip and stops the bar from writing filters the sidebar cannot show or
 * remove. Adding a facet gives the bar the field for free.
 */
function facetColumns(config: FilterConfig) {
  const exposed = new Set(config.facets.map((facet) => facet.column));
  return config.columnDefinitions.filter((column) => exposed.has(column.id));
}

/**
 * Sessions filter columns whose sidebar values come from
 * `sessions.filterOptions*` — the AI prompt's vocabulary for this view.
 */
const AI_CONTEXT_FIELDS = [
  { observedOptionsKey: "environment", promptLabel: "environment" },
  { observedOptionsKey: "userIds", promptLabel: "userIds (user)" },
  { observedOptionsKey: "tags", promptLabel: "tags" },
  {
    observedOptionsKey: SCORE_COLUMNS.observation.numeric,
    promptLabel: "scores.<name> (numeric)",
  },
  {
    observedOptionsKey: SCORE_COLUMNS.observation.categorical,
    promptLabel: "scores.<name> (categorical)",
  },
  {
    observedOptionsKey: SCORE_COLUMNS.observation.boolean,
    promptLabel: "scores.<name> (boolean)",
  },
] as const;

/**
 * Grammar overlay: only what `ColumnDefinition` deliberately does not carry —
 * user-facing aliases, display units, and prose labels. Units matter here
 * because every sessions number column is a magnitude someone types with an
 * implied unit (`duration:>30`, `cost:>0.5`).
 */
const SESSION_FIELD_OVERLAY = {
  id: {
    aliases: ["sessionid", "session_id", "session"],
    label: "Session ID",
    description: "Session identifier",
  },
  environment: { aliases: ["env"] },
  userIds: {
    aliases: ["userid", "user_id", "user", "users", "userids"],
    label: "User IDs",
    description: "User ids seen in the session",
  },
  tags: {
    aliases: ["tag", "tracetags", "trace_tags"],
    label: "Trace tags",
    description: "Tags on the session's traces",
  },
  sessionDuration: {
    aliases: ["duration", "sessionduration", "session_duration"],
    label: "Session duration",
    description: "Session duration in seconds",
    unit: "s",
  },
  countTraces: {
    aliases: ["traces", "tracecount", "trace_count", "counttraces"],
    label: "Trace count",
    description: "Number of traces in the session",
  },
  inputTokens: { aliases: ["inputtokens", "input_tokens"] },
  outputTokens: { aliases: ["outputtokens", "output_tokens"] },
  totalTokens: { aliases: ["totaltokens", "total_tokens", "tokens"] },
  inputCost: { aliases: ["inputcost", "input_cost"], unit: "$" },
  outputCost: { aliases: ["outputcost", "output_cost"], unit: "$" },
  totalCost: { aliases: ["totalcost", "total_cost", "cost"], unit: "$" },
  commentCount: { aliases: ["commentcount", "comment_count"] },
  commentContent: {
    aliases: ["commentcontent", "comment_content", "comment"],
    label: "Comment text",
    description: "Text of comments on the session",
  },
};

function sessionsRegistry(config: FilterConfig, metadata: boolean) {
  return fieldRegistryFromColumns(facetColumns(config), {
    id: "sessions",
    metadata,
    scores: true,
    // Sessions aggregate scores at session level; the backend has no
    // `trace_scores_*` columns, so the legacy trace namespace stays closed.
    traceScores: false,
    // Sessions has no full-text lane. `id contains` is its most-applied filter
    // by a wide margin, so a bare word means that rather than an error.
    allowFreeText: false,
    defaultTextField: "id",
    recentSearches: true,
    searchExamples: [
      "userIds:alice",
      "tags:(billing AND urgent)",
      "duration:>30",
      "scores.helpfulness:>0.8",
    ],
    aiContextFields: AI_CONTEXT_FIELDS,
    fields: SESSION_FIELD_OVERLAY,
  });
}

/**
 * v4 (events-backed) sessions. The v3 config differs by exactly one column — v4
 * adds `metadata` — so one derivation parameterised by the metadata flag would
 * cover both. Only the v4 registry exists because the bar is gated on v4; a v3
 * variant would be unreachable, and the recipe forbids speculative registries.
 */
export const SESSIONS_FIELD_REGISTRY: FieldRegistry = sessionsRegistry(
  sessionEventsFilterConfig,
  true,
);
