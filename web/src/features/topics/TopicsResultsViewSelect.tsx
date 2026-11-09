import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import useLocalStorage from "@/src/components/useLocalStorage";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export const TOPICS_RESULTS_VIEWS = [
  { value: "treemap", label: "Treemap" },
  { value: "treemap-side", label: "Treemap, side by side" },
  { value: "grid", label: "Grid" },
  { value: "map", label: "Map" },
] as const;

export type TopicsResultsView = (typeof TOPICS_RESULTS_VIEWS)[number]["value"];

export function TopicsResultsViewSelect({
  value,
  onValueChange,
}: TopicsResultsViewSelectProps) {
  const selected = TOPICS_RESULTS_VIEWS.find(
    (option) => option.value === value,
  );
  return (
    <DropdownMenu
      ariaLabel="Topics view"
      items={TOPICS_RESULTS_VIEWS.map((option) => ({
        type: "item" as const,
        id: option.value,
        title: option.label,
        onClick: () => onValueChange(option.value),
      }))}
    >
      {({ getTriggerProps }) => (
        <button
          {...getTriggerProps()}
          type="button"
          aria-label={`Topics view: ${selected?.label ?? ""}`}
          className="text-foreground hover:bg-accent focus-visible:ring-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold focus-visible:ring-2 focus-visible:outline-hidden"
        >
          {selected?.label}
          <DropdownIndicator />
        </button>
      )}
    </DropdownMenu>
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
