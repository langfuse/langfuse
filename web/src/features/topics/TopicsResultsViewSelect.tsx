import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { SelectDropdown } from "@/src/components/design-system/SelectDropdown/SelectDropdown";
import useLocalStorage from "@/src/components/useLocalStorage";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const VIEWS = [
  { value: "treemap", label: "Treemap" },
  { value: "grid-vertical", label: "Grid vertical" },
  { value: "treemap-vertical", label: "Treemap vertical" },
  { value: "grid", label: "Grid horizontal" },
  { value: "bars", label: "Bars" },
  { value: "map", label: "Map" },
] as const;

export type TopicsResultsView = (typeof VIEWS)[number]["value"];

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

export function TopicsResultsViewSelect({
  value,
  onValueChange,
}: {
  value: TopicsResultsView;
  onValueChange: (view: TopicsResultsView) => void;
}) {
  const capture = usePostHogClientCapture();
  function changeView(view: TopicsResultsView) {
    if (view === value) return;
    capture("topics:results_view_select", { view, previousView: value });
    onValueChange(view);
  }
  return (
    <SelectDropdown
      aria-label="Topics view"
      value={value}
      onValueChange={changeView}
      options={VIEWS.map(({ value, label }) => ({ value, label }))}
    >
      {({ getTriggerProps, selectedLabel }) => (
        <button
          {...getTriggerProps()}
          className="text-foreground hover:bg-accent focus-visible:ring-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold focus-visible:ring-2 focus-visible:outline-hidden"
        >
          {selectedLabel}
          <DropdownIndicator />
        </button>
      )}
    </SelectDropdown>
  );
}
