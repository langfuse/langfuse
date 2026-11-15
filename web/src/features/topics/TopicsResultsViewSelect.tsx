import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import useLocalStorage from "@/src/components/useLocalStorage";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled";

const TOPICS_RESULTS_VIEWS = [
  { value: "treemap", label: "Treemap" },
  { value: "list", label: "List" },
  // Debug view of cluster assignment; Internal view only.
  { value: "map", label: "Map", internalOnly: true },
] as const;

export type TopicsResultsView = (typeof TOPICS_RESULTS_VIEWS)[number]["value"];

export function TopicsResultsViewSelect({
  value,
  onValueChange,
}: TopicsResultsViewSelectProps) {
  const views = useAvailableResultsViews();
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as TopicsResultsView)}
    >
      <Tabs.List variant="inset" size="sm" aria-label="Topics view">
        {views.map((option) => (
          <Tabs.Trigger
            key={option.value}
            value={option.value}
            label={option.label}
            internal={"internalOnly" in option}
          />
        ))}
      </Tabs.List>
    </Tabs>
  );
}

export function useTopicsResultsView() {
  const { view, selectView } = usePersistedResultsView(
    "topicsResultsView",
    TOPICS_RESULTS_VIEWS.map((option) => option.value),
  );
  return [view, selectView] as const;
}

export type MobileTopicsVisualization = Extract<
  TopicsResultsView,
  "treemap" | "map"
>;

/** The handheld Visualize tab; the map shares the desktop Map view's internal gate. */
export function useMobileTopicsVisualization() {
  const { view, selectView, available } =
    usePersistedResultsView<MobileTopicsVisualization>(
      "topicsMobileVisualization",
      ["treemap", "map"],
      "mobile",
    );
  return {
    view,
    onViewChange: available.length > 1 ? selectView : undefined,
  };
}

/** Falls back to the treemap when the stored view is not allowed or no longer available. */
function usePersistedResultsView<T extends TopicsResultsView>(
  storageKey: string,
  views: readonly T[],
  surface?: "mobile",
) {
  const capture = usePostHogClientCapture();
  const [stored, setStored] = useLocalStorage<T>(storageKey, "treemap" as T);
  const available = useAvailableResultsViews()
    .map((option) => option.value)
    .filter((value): value is T => views.includes(value as T));
  const view = available.includes(stored) ? stored : ("treemap" as T);
  function selectView(nextView: T) {
    if (nextView === view) return;
    capture("topics:results_view_select", {
      view: nextView,
      previousView: view,
      ...(surface && { surface }),
    });
    setStored(nextView);
  }
  return { view, selectView, available };
}

function useAvailableResultsViews() {
  const internal = useInternalFeaturesEnabled();
  return TOPICS_RESULTS_VIEWS.filter(
    (option) => internal || !("internalOnly" in option),
  );
}

type TopicsResultsViewSelectProps = {
  value: TopicsResultsView;
  onValueChange: (view: TopicsResultsView) => void;
};
