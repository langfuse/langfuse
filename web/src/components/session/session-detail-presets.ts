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
  /**
   * When true, this view hides observations that carry no input/output. It is
   * the only "view rule" that is not expressible as a FilterState (it needs a
   * cross-field OR on input/output), so it lives on the view and is applied at
   * render — see TraceEventsRow. Named explicitly so it is a visible choice,
   * not hidden behaviour.
   */
  hideObservationsWithoutIO?: boolean;
}

export const SESSION_DETAIL_SYSTEM_PRESETS: SessionDetailSystemPreset[] = [
  {
    id: `${SYSTEM_PRESET_ID_PREFIX}with_io__`,
    name: "All observations with I/O",
    description:
      "Every observation that has input or output — a chat renders as a chat, an agent run shows its tool calls",
    filters: [],
    hideObservationsWithoutIO: true,
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
 * Render config for the currently selected view — the single source of truth
 * (`selectedViewId`) drives what each trace card shows. `label` is the view's
 * display name (null when the user is on a custom/saved filter);
 * `hideObservationsWithoutIO` mirrors the selected view's flag.
 */
export const getSessionDetailViewConfig = (
  selectedViewId: string | null,
): { label: string | null; hideObservationsWithoutIO: boolean } => {
  const preset = SESSION_DETAIL_SYSTEM_PRESETS.find(
    (candidate) => candidate.id === selectedViewId,
  );
  return {
    label: preset?.name ?? null,
    hideObservationsWithoutIO: preset?.hideObservationsWithoutIO ?? false,
  };
};
