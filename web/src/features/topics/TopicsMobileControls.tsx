import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
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
  return (
    <div className="ph-no-capture flex min-w-0 items-center gap-2">
      <div className="w-40 min-w-0">
        <SelectInput
          aria-label="Topics facet"
          placeholder="Facet"
          value={selectedFacet}
          onValueChange={onSelectFacet}
          options={facets.map((facet) => ({
            value: facet.facetId,
            label: facet.name,
          }))}
        />
      </div>
      <div className="w-28 shrink-0">
        <SelectInput
          aria-label="Topics view"
          placeholder="Visualize as"
          value={view}
          onValueChange={onSelectView}
          options={TOPICS_RESULTS_VIEWS}
        />
      </div>
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
