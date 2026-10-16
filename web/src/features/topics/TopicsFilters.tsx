import { Plus } from "lucide-react";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
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
            <div className="flex shrink-0 items-center gap-1 px-2">
              <Button
                text="Custom facet"
                icon={Plus}
                variant="ghost"
                size="sm"
                disabled
              />
              <Badge text="Coming soon" color="blue" size="sm" />
            </div>
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
