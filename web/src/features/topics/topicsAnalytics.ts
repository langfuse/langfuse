// Topics adoption funnels: page -> landing -> setup flow -> first map, then
// exploration. Metadata only: enums, counts and booleans. Never topic, facet,
// map or question names, filter values, search text, model ids or LLM
// connection names (connection names are user-defined).
//
// Every event carries the project and organization, so funnels can count
// projects (`count(DISTINCT properties.projectId)`) as well as users.

type TopicsAnalyticsContext = {
  projectId: string;
  orgId: string;
  /** Topics read only the v4 events table. */
  isV4: true;
};

export type TopicsSetupStep = "questions" | "traces" | "review";

/** One opening of the setup dialog; joins its step, abort and finish events. */
type SetupAttempt = { setupAttemptId: string };

/** Counts only; never the filter values. */
type FilterUsage = { filterCount: number; hasFilter: boolean };

export type TopicsPageState =
  | "landing"
  | "waiting_for_traces"
  | "setup_running"
  | "setup_failed"
  | "building"
  | "snapshot"
  | "results";

type TopicsMapKind = "rule" | "analysis";

/** The visualization a map is shown in; handheld screens have their own. */
export type TopicsMapView =
  | "treemap"
  | "scatter"
  | "mobile_treemap"
  | "mobile_map";

type MapView = {
  mapKind: TopicsMapKind;
  view: TopicsMapView;
  /** Topics across every facet of the map, Unassigned excluded. */
  topicCount: number;
  facetCount: number;
  /** Maps and snapshots in the project when the map was shown. */
  mapCount: number;
};

type TopicsEventProperties = {
  /** Once per page mount, as soon as the page knows what it shows. */
  "topics:page_viewed": {
    pageState: TopicsPageState;
    canWrite: boolean;
    mapCount: number;
  };
  /** The "See what your traces are about" landing, before setup. */
  "topics:landing_viewed": { canWrite: boolean; canConfigure: boolean };
  "topics:setup_flow_opened": SetupAttempt & {
    hasConnection: boolean;
    /** False when the project already has a rule from an earlier setup. */
    isFirstSetup: boolean;
  };
  /** Once per attempt and step; going Back and Next again does not repeat it. */
  "topics:setup_flow_step_completed": SetupAttempt &
    (
      | {
          step: "questions";
          stepNumber: 1;
          questionCount: number;
          followsRecommendation: boolean;
          waitMinutes: number;
        }
      | (FilterUsage & {
          step: "traces";
          stepNumber: 2;
          samplePercent: number;
        })
    );
  /** The user closed the dialog before Start analyzing. */
  "topics:setup_flow_aborted": SetupAttempt & {
    lastStep: TopicsSetupStep;
    stepNumber: number;
    durationMs: number;
    hadError: boolean;
  };
  "topics:setup_flow_error": SetupAttempt & {
    step: TopicsSetupStep;
    stage: "model_check" | "save" | "start";
  };
  /** Left the dialog to add an LLM connection. */
  "topics:setup_flow_connection_redirect": SetupAttempt & {
    canAddConnection: boolean;
  };
  /** Start analyzing succeeded and the first map's setup is running. */
  "topics:setup_flow_finished": SetupAttempt &
    FilterUsage & {
      samplePercent: number;
      questionCount: number;
      /** A finished cost estimate for this filter and these questions was on screen. */
      hasCostEstimate: boolean;
      durationMs: number;
    };
  /** Estimate cost, in the setup Review step or the New map dialog. */
  "topics:cost_estimate_started": { source: "setup" | "new_map" };
  /** Once per page mount and map, when the map has topics. */
  "topics:map_viewed": MapView;
  /** Once per browser and map, the first time it is shown with topics. */
  "topics:first_map_viewed": MapView;
  "topics:map_created": FilterUsage & {
    facetCount: number;
    samplePercent: number;
  };
  "topics:snapshot_started": FilterUsage & {
    facetCount: number;
    windowDays: number;
    /** Traces the snapshot summarizes first; 0 uses stored summaries only. */
    summarizeCount: number;
  };
  "topics:map_selected": { mapKind: TopicsMapKind; mapCount: number };
  "topics:facet_selected": {
    surface: "tabs" | "mobile_controls";
    facetCount: number;
  };
  "topics:topic_selected": {
    view: TopicsMapView;
    surface: "tile" | "row" | "map";
    isUnassigned: boolean;
  };
  "topics:trace_opened": { view: TopicsMapView };
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
