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
  const capture = usePostHogClientCapture();
  const [view, setView] = useLocalStorage<TopicsResultsView>(
    "topicsResultsView",
    "treemap",
  );
  const views = useAvailableResultsViews();
  const effectiveView = views.some((option) => option.value === view)
    ? view
    : "treemap";
  function selectView(nextView: TopicsResultsView) {
    if (nextView === effectiveView) return;
    capture("topics:results_view_select", {
      view: nextView,
      previousView: effectiveView,
    });
    setView(nextView);
  }
  return [effectiveView, selectView] as const;
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
