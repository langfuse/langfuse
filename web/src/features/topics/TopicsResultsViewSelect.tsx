import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import useLocalStorage from "@/src/components/useLocalStorage";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const TOPICS_RESULTS_VIEWS = [
  { value: "treemap", label: "Treemap" },
  { value: "list", label: "List" },
  { value: "map", label: "Scatter" },
] as const;

export type TopicsResultsView = (typeof TOPICS_RESULTS_VIEWS)[number]["value"];

export function TopicsResultsViewSelect({
  value,
  onValueChange,
}: TopicsResultsViewSelectProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as TopicsResultsView)}
    >
      <Tabs.List variant="inset" size="sm" aria-label="Topics view">
        {TOPICS_RESULTS_VIEWS.map((option) => (
          <Tabs.Trigger
            key={option.value}
            value={option.value}
            label={option.label}
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

/** The handheld Visualize tab. */
export function useMobileTopicsVisualization() {
  const { view, selectView } =
    usePersistedResultsView<MobileTopicsVisualization>(
      "topicsMobileVisualization",
      ["treemap", "map"],
      "mobile",
    );
  return { view, onViewChange: selectView };
}

/** Falls back to the treemap when the stored view is no longer available. */
function usePersistedResultsView<T extends TopicsResultsView>(
  storageKey: string,
  views: readonly T[],
  surface?: "mobile",
) {
  const capture = usePostHogClientCapture();
  const [stored, setStored] = useLocalStorage<T>(storageKey, "treemap" as T);
  const view = views.includes(stored) ? stored : ("treemap" as T);
  function selectView(nextView: T) {
    if (nextView === view) return;
    capture("topics:results_view_select", {
      view: nextView,
      previousView: view,
      ...(surface && { surface }),
    });
    setStored(nextView);
  }
  return { view, selectView };
}

type TopicsResultsViewSelectProps = {
  value: TopicsResultsView;
  onValueChange: (view: TopicsResultsView) => void;
};
