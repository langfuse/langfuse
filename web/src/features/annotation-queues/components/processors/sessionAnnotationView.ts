import { type FilterState } from "@langfuse/shared";
import {
  SESSION_DETAIL_SYSTEM_PRESETS,
  type SessionDetailSystemPreset,
} from "@/src/features/sessions/session-detail-presets";

export type SessionAnnotationSavedView = {
  id: string;
  name: string;
  filters: FilterState;
};

export type ResolvedSessionAnnotationView = {
  filterState: FilterState;
  viewLabel: string | null;
  selectedSystemPreset: SessionDetailSystemPreset | null;
  selectedSavedView: SessionAnnotationSavedView | null;
};

export const SESSION_ANNOTATION_VIEW_DEFAULT_ID = null;

export const getSessionAnnotationViewStorageKey = (
  annotationQueueId: string,
): string => `langfuse:annotation-queue:session-view:${annotationQueueId}`;

/**
 * Resolve the selected annotation-queue session view to the filters passed to
 * `LazyTraceEventsRow` and the label shown in its empty-state notice.
 *
 * `null` preserves today's behaviour: no filtering (`[]`) and no view label.
 * Unknown ids fall back to the same default so a deleted saved view never
 * blinds the queue.
 */
export const resolveSessionAnnotationView = ({
  selectedViewId,
  savedViews = [],
}: {
  selectedViewId: string | null;
  savedViews?: SessionAnnotationSavedView[];
}): ResolvedSessionAnnotationView => {
  if (!selectedViewId) {
    return {
      filterState: [],
      viewLabel: null,
      selectedSystemPreset: null,
      selectedSavedView: null,
    };
  }

  const selectedSystemPreset =
    SESSION_DETAIL_SYSTEM_PRESETS.find(
      (preset) => preset.id === selectedViewId,
    ) ?? null;
  if (selectedSystemPreset) {
    return {
      filterState: selectedSystemPreset.filters,
      viewLabel: selectedSystemPreset.name,
      selectedSystemPreset,
      selectedSavedView: null,
    };
  }

  const selectedSavedView =
    savedViews.find((view) => view.id === selectedViewId) ?? null;
  if (selectedSavedView) {
    return {
      filterState: selectedSavedView.filters ?? [],
      viewLabel: selectedSavedView.name,
      selectedSystemPreset: null,
      selectedSavedView,
    };
  }

  return {
    filterState: [],
    viewLabel: null,
    selectedSystemPreset: null,
    selectedSavedView: null,
  };
};
