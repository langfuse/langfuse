import { Tabs } from "@/src/components/design-system/Tabs/Tabs";

export function TopicsFacetTabs({
  facets,
  selectedFacet,
  onSelectFacet,
}: TopicsFacetTabsProps) {
  return (
    <div className="ph-no-capture">
      <Tabs value={selectedFacet} onValueChange={onSelectFacet}>
        <Tabs.List variant="inset" size="sm" aria-label="Topics facets">
          {facets.map((facet) => (
            <Tabs.Trigger
              key={facet.facetId}
              value={facet.facetId}
              label={facet.name}
            />
          ))}
        </Tabs.List>
      </Tabs>
    </div>
  );
}

type TopicsFacetTabsProps = {
  facets: readonly { facetId: string; name: string }[];
  selectedFacet: string;
  onSelectFacet: (facetId: string) => void;
};
