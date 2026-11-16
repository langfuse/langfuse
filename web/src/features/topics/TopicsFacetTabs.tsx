import { Tabs } from "@/src/components/design-system/Tabs/Tabs";

export function TopicsFacetTabs({
  facets,
  selectedFacet,
  onSelectFacet,
  newTopicCounts,
}: TopicsFacetTabsProps) {
  return (
    <div className="ph-no-capture flex text-sm">
      <Tabs value={selectedFacet} onValueChange={onSelectFacet}>
        <Tabs.List variant="inset" size="sm" aria-label="Topics facets">
          {facets.map((facet) => {
            const newCount = newTopicCounts?.get(facet.facetId);
            return (
              <Tabs.Trigger
                key={facet.facetId}
                value={facet.facetId}
                label={facet.name}
                badge={newCount ? `${newCount} new` : undefined}
              />
            );
          })}
        </Tabs.List>
      </Tabs>
    </div>
  );
}

type TopicsFacetTabsProps = {
  facets: readonly { facetId: string; name: string }[];
  selectedFacet: string;
  onSelectFacet: (facetId: string) => void;
  /** New topics per facet in the latest run of the shown map. */
  newTopicCounts?: ReadonlyMap<string, number>;
};
