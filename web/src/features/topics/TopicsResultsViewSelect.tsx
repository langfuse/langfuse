import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import useLocalStorage from "@/src/components/useLocalStorage";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const VIEWS = [
  { value: "treemap", label: "Treemap" },
  { value: "grid", label: "Grid" },
  { value: "map", label: "Map" },
] as const;

export type TopicsResultsView = (typeof VIEWS)[number]["value"];

export function TopicsResultsViewSelect({
  value,
  onValueChange,
}: TopicsResultsViewSelectProps) {
  const capture = usePostHogClientCapture();
  function changeView(view: TopicsResultsView) {
    if (view === value) return;
    capture("topics:results_view_select", { view, previousView: value });
    onValueChange(view);
  }
  const selected = VIEWS.find((option) => option.value === value);
  return (
    <DropdownMenu
      ariaLabel="Topics view"
      items={VIEWS.map((option) => ({
        type: "item" as const,
        id: option.value,
        title: option.label,
        onClick: () => changeView(option.value),
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
  const [view, setView] = useLocalStorage<TopicsResultsView>(
    "topicsResultsView",
    "treemap",
  );
  return [
    VIEWS.some((option) => option.value === view) ? view : "treemap",
    setView,
  ] as const;
}

type TopicsResultsViewSelectProps = {
  value: TopicsResultsView;
  onValueChange: (view: TopicsResultsView) => void;
};
