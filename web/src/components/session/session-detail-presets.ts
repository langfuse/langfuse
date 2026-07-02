import { type FilterState } from "@langfuse/shared";

const SYSTEM_PRESET_ID_PREFIX = "__langfuse_";

/**
 * DOM id of the session-detail "View" drawer trigger. The empty-state notice
 * (TraceEventsRow) uses it to open the View menu, so switching view from a
 * card routes through the same single control — no per-card state.
 */
export const SESSION_DETAIL_VIEW_TRIGGER_ID = "session-detail-view-trigger";

export interface SessionDetailSystemPreset {
  id: string;
  name: string;
  description?: string;
  filters: FilterState;
}

export const SESSION_DETAIL_SYSTEM_PRESETS: SessionDetailSystemPreset[] = [
  {
    id: `${SYSTEM_PRESET_ID_PREFIX}with_io__`,
    name: "All observations with I/O",
    description:
      "Every observation that has input or output — a chat renders as a chat, an agent run shows its tool calls",
    // Expressed as a real, renderable filter (the "Has Input or Output" boolean
    // column lowers to `input != '' OR output != ''`), so the view shows up in
    // the "Filter observations" UI like any other filter — no hidden view rule.
    filters: [
      {
        column: "hasInputOutput",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ] satisfies FilterState,
  },
  {
    id: `${SYSTEM_PRESET_ID_PREFIX}all__`,
    name: "All observations",
    description:
      "Every observation in each trace, including ones without input/output",
    filters: [],
  },
  {
    id: `${SYSTEM_PRESET_ID_PREFIX}first_generation__`,
    name: "First Generation in Trace",
    description: "Shows only the first generation in each trace",
    filters: [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
      {
        column: "positionInTrace",
        type: "positionInTrace",
        operator: "=",
        key: "first",
      },
    ] satisfies FilterState,
  },
  {
    id: `${SYSTEM_PRESET_ID_PREFIX}last_generation__`,
    name: "Last Generation in Trace",
    description: "Shows only the last generation in each trace",
    filters: [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
      {
        column: "positionInTrace",
        type: "positionInTrace",
        operator: "=",
        key: "last",
      },
    ] satisfies FilterState,
  },
];

/**
 * The default view: "All observations with I/O". Shows the real session out of
 * the box (chat looks like chat, an agent run shows its tool calls) without the
 * old "first generation" default that rendered empty cards for agentic sessions
 * with no GENERATION (LFE-10520).
 */
export const getSessionDetailDefaultPreset = () =>
  SESSION_DETAIL_SYSTEM_PRESETS[0];

/**
 * Which system preset to auto-apply on load. A selected system preset (deep
 * link / saved view) is re-applied; a user's own filters win; otherwise the
 * default "All observations with I/O" view is applied.
 */
export const getSessionDetailPresetToApply = ({
  selectedViewId,
  hasFilters,
}: {
  selectedViewId: string | null;
  hasFilters: boolean;
}): SessionDetailSystemPreset | null => {
  const selectedSystemPreset = SESSION_DETAIL_SYSTEM_PRESETS.find(
    (preset) => preset.id === selectedViewId,
  );

  if (selectedViewId && !selectedSystemPreset) {
    return null;
  }

  if (hasFilters) {
    return null;
  }

  return selectedSystemPreset ?? getSessionDetailDefaultPreset();
};

/**
 * Display name of the currently selected system view (null when the user is on
 * a custom/saved filter). Used only to label the empty-state notice — what each
 * card renders is driven entirely by the FilterState (the single source of
 * truth), applied server-side.
 */
export const getSessionDetailViewLabel = (
  selectedViewId: string | null,
): string | null =>
  SESSION_DETAIL_SYSTEM_PRESETS.find((preset) => preset.id === selectedViewId)
    ?.name ?? null;
