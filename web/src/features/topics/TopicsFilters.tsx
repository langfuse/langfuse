import { type ReactNode } from "react";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { resolveTopicFacetId } from "./topic-facet-selection";

export function TopicsFilters({
  facets,
  selectedFacetId,
  onSelectFacet,
  children,
}: TopicsFiltersProps) {
  const selectedFacet = resolveTopicFacetId(facets, selectedFacetId);
  if (!selectedFacet) return children;

  return (
    <div className="ph-no-capture flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Tabs value={selectedFacet} onValueChange={onSelectFacet} layout="fill">
        <div className="shrink-0 overflow-x-auto">
          <Tabs.List variant="underline" aria-label="Topics facets">
            {facets.map((facet) => (
              <Tabs.Trigger
                key={facet.facetId}
                value={facet.facetId}
                label={facet.name}
              />
            ))}
          </Tabs.List>
        </div>
        <Tabs.Content value={selectedFacet} layout="fill">
          <div className="flex min-h-0 flex-1 flex-col pt-2">{children}</div>
        </Tabs.Content>
      </Tabs>
    </div>
  );
}

type TopicsFiltersProps = {
  facets: readonly { facetId: string; name: string }[];
  selectedFacetId: string | undefined;
  onSelectFacet: (facetId: string) => void;
  children?: ReactNode;
};
