import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";

/** Handheld question picker; handheld shows only the treemap, so there is no view choice. */
export function TopicsMobileControls({
  facets,
  selectedFacet,
  onSelectFacet,
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
    </div>
  );
}

type TopicsMobileControlsProps = {
  facets: readonly { facetId: string; name: string }[];
  selectedFacet: string;
  onSelectFacet: (facetId: string) => void;
};
