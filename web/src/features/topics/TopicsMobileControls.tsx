import { type ChangeEvent } from "react";
import {
  TOPICS_RESULTS_VIEWS,
  type TopicsResultsView,
} from "./TopicsResultsViewSelect";

export function TopicsMobileControls({
  facets,
  selectedFacet,
  onSelectFacet,
  view,
  onSelectView,
}: TopicsMobileControlsProps) {
  function selectFacet(event: ChangeEvent<HTMLSelectElement>) {
    onSelectFacet(event.target.value);
  }
  function selectView(event: ChangeEvent<HTMLSelectElement>) {
    const selected = TOPICS_RESULTS_VIEWS.find(
      (option) => option.value === event.target.value,
    );
    if (selected) onSelectView(selected.value);
  }

  return (
    <div className="ph-no-capture flex min-w-0 items-center gap-2">
      <label className="w-40 min-w-0">
        <span className="sr-only">Facet</span>
        <select
          aria-label="Topics facet"
          className="bg-background border-input focus-visible:ring-ring h-8 w-full min-w-0 rounded-md border py-1 pr-7 pl-2 text-sm focus-visible:ring-2 focus-visible:outline-hidden"
          value={selectedFacet}
          onChange={selectFacet}
        >
          {facets.map((facet) => (
            <option key={facet.facetId} value={facet.facetId}>
              {facet.name}
            </option>
          ))}
        </select>
      </label>
      <label className="w-24 shrink-0">
        <span className="sr-only">Visualize as</span>
        <select
          aria-label="Topics view"
          className="bg-background border-input focus-visible:ring-ring h-8 w-full min-w-0 rounded-md border py-1 pr-7 pl-2 text-sm focus-visible:ring-2 focus-visible:outline-hidden"
          value={view}
          onChange={selectView}
        >
          {TOPICS_RESULTS_VIEWS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

type TopicsMobileControlsProps = {
  facets: readonly { facetId: string; name: string }[];
  selectedFacet: string;
  onSelectFacet: (facetId: string) => void;
  view: TopicsResultsView;
  onSelectView: (view: TopicsResultsView) => void;
};
