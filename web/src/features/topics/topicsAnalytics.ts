// Topics adoption funnel: page -> setup flow -> map, then exploration.
// Metadata only: enums, counts and booleans. Never topic, facet, map or
// question names, filter values, search text, model ids or connection names.

/** Added to every event, so funnels can count projects as well as users. */
type TopicsAnalyticsContext = {
  projectId: string;
  orgId: string;
  /** Topics read only the v4 events table. */
  isV4: true;
};

type TopicsSetupStep = "questions" | "traces" | "review";

export type TopicsPageState =
  | "landing"
  | "waiting_for_traces"
  | "setup_running"
  | "setup_failed"
  | "building"
  | "snapshot"
  | "results";

type TopicsMapKind = "rule" | "analysis";

/** The visualization a topic was picked in; handheld screens have their own. */
type TopicsMapView = "treemap" | "scatter" | "mobile_treemap" | "mobile_map";

type TopicsEventProperties = {
  /** Once per page mount, as soon as the page knows what it shows. */
  "topics:page_viewed": {
    pageState: TopicsPageState;
    canWrite: boolean;
    /** Maps and snapshots in the project. */
    mapCount: number;
  };
  "topics:setup_flow_opened": {
    hasConnection: boolean;
    /** False when the project already has a rule from an earlier setup. */
    isFirstSetup: boolean;
  };
  "topics:setup_flow_step_completed":
    | {
        step: "questions";
        questionCount: number;
        followsRecommendation: boolean;
        waitMinutes: number;
      }
    | { step: "traces"; samplePercent: number; filterCount: number };
  /** A step's Next failed. */
  "topics:setup_flow_error": { step: TopicsSetupStep };
  /** Start analyzing succeeded and the first map's setup is running. */
  "topics:setup_flow_finished": {
    samplePercent: number;
    questionCount: number;
    filterCount: number;
  };
  /** The dialog where the user requested a processing estimate. */
  "topics:cost_estimate_started": { source: "setup" | "new_map" | "snapshot" };
  /** Once per page mount and map, when the map has topics. */
  "topics:map_viewed": {
    mapKind: TopicsMapKind;
    /** Topics across every facet of the map, Unassigned excluded. */
    topicCount: number;
    facetCount: number;
  };
  "topics:map_created": {
    filterCount: number;
    facetCount: number;
    samplePercent: number;
  };
  "topics:map_refreshed": {
    filterCount: number;
    facetCount: number;
    /** Minutes since the map's previous refit; null before its first fit. */
    minutesSinceLastRefit: number | null;
  };
  "topics:snapshot_started": {
    filterCount: number;
    facetCount: number;
    windowDays: number;
    /** Traces the snapshot summarizes first; 0 uses stored summaries only. */
    summarizeCount: number;
  };
  "topics:map_selected": { mapKind: TopicsMapKind; mapCount: number };
  "topics:topic_selected": {
    view: TopicsMapView;
    surface: "tile" | "row" | "map";
    isUnassigned: boolean;
  };
  "topics:results_view_select": {
    view: string;
    previousView: string;
    surface?: "mobile";
  };
  /** Tracing pulse chart topic stripe. */
  "topics:stripe_toggle": { isSelected: boolean; topicCount: number };
  /** "Give feedback" on the Topics page, opening the support form. */
  "topics:feedback_open": Record<string, never>;
};

export type TopicsEventName = keyof TopicsEventProperties;

/** What a call site passes; `useTopicsCapture` adds the context. */
export type TopicsEventInput<E extends TopicsEventName> =
  TopicsEventProperties[E];

export type TopicsEventMap = {
  [E in TopicsEventName]: TopicsEventProperties[E] & TopicsAnalyticsContext;
};

/** Metadata-only payload for `topics:map_refreshed` from a live map's config. */
export function mapRefreshedProperties(
  rule: {
    filter: readonly unknown[];
    facetIds: readonly string[];
    lastRefitAt: string | null;
  },
  now: number,
): TopicsEventInput<"topics:map_refreshed"> {
  const lastRefitMs = rule.lastRefitAt
    ? Date.parse(rule.lastRefitAt)
    : Number.NaN;
  return {
    filterCount: rule.filter.length,
    facetCount: rule.facetIds.length,
    minutesSinceLastRefit: Number.isFinite(lastRefitMs)
      ? Math.max(0, Math.round((now - lastRefitMs) / 60_000))
      : null,
  };
}
