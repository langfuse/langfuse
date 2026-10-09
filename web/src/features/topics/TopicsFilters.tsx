import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { resolveTopicFacetId } from "./topic-facet-selection";
import { topicTimeRangePresets } from "./time-range";

const layouts = {
  header: {
    root: "ph-no-capture flex min-w-0 flex-wrap items-center gap-2",
    facet: "w-44",
    range: "w-36",
  },
  menu: {
    root: "ph-no-capture flex flex-col gap-3 p-1",
    facet: "flex w-full flex-col gap-1",
    range: "flex w-full flex-col gap-1",
  },
};

export function TopicsFilters({
  layout,
  facets,
  selectedFacetId,
  timeWindow,
  onSelectFacet,
  onSelectTimeWindow,
}: TopicsFiltersProps) {
  const selectedFacet = resolveTopicFacetId(facets, selectedFacetId);
  const classes = layouts[layout];
  return (
    <div className={classes.root}>
      {facets.length > 0 && selectedFacet && (
        <div className={classes.facet}>
          {layout === "menu" && (
            <span className="text-muted-foreground text-xs">Facet</span>
          )}
          <Select value={selectedFacet} onValueChange={onSelectFacet}>
            <SelectTrigger aria-label="Topics facet" className="h-8">
              <SelectValue placeholder="Facet" />
            </SelectTrigger>
            <SelectContent className="ph-no-capture">
              {facets.map((facet) => (
                <SelectItem key={facet.facetId} value={facet.facetId}>
                  {facet.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className={classes.range}>
        {layout === "menu" && (
          <span className="text-muted-foreground text-xs">Time range</span>
        )}
        <SelectInput
          aria-label="Topics time range"
          placeholder="Topics time range"
          value={timeWindow}
          options={topicTimeRangePresets}
          onValueChange={onSelectTimeWindow}
        />
      </div>
    </div>
  );
}

type TopicsFiltersProps = {
  layout: "header" | "menu";
  facets: readonly { facetId: string; name: string }[];
  selectedFacetId: string | undefined;
  timeWindow: string;
  onSelectFacet: (facetId: string) => void;
  onSelectTimeWindow: (value: string) => void;
};
