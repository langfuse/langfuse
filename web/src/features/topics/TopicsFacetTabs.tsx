import { Badge } from "@/src/components/design-system/Badge/Badge";
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
            const newDescription = `${newCount} new ${newCount === 1 ? "topic" : "topics"} in the last run`;
            return newCount ? (
              <Tabs.Trigger
                key={facet.facetId}
                value={facet.facetId}
                title={`${facet.name}: ${newDescription}`}
              >
                <span
                  className="min-w-0 truncate leading-normal"
                  title={facet.name}
                >
                  {facet.name}
                </span>
                <Badge
                  size="sm"
                  color="info"
                  text={`${newCount} new`}
                  title={newDescription}
                />
              </Tabs.Trigger>
            ) : (
              <Tabs.Trigger
                key={facet.facetId}
                value={facet.facetId}
                label={facet.name}
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
