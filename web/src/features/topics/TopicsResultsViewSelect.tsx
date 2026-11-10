import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import useLocalStorage from "@/src/components/useLocalStorage";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export const TOPICS_RESULTS_VIEWS = [
  { value: "treemap", label: "Treemap" },
  { value: "list", label: "List" },
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
  const capture = usePostHogClientCapture();
  const [view, setView] = useLocalStorage<TopicsResultsView>(
    "topicsResultsView",
    "treemap",
  );
  const effectiveView = TOPICS_RESULTS_VIEWS.some(
    (option) => option.value === view,
  )
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

type TopicsResultsViewSelectProps = {
  value: TopicsResultsView;
  onValueChange: (view: TopicsResultsView) => void;
};
