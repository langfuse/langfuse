import type { FilterState } from "@langfuse/shared";

import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { Badge } from "@/src/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import {
  COMPOSER_SURFACE_CLASSES,
  COMPOSER_TEXT_CLASSES,
} from "@/src/features/search-bar/components/composer-chrome";
import { ComposerTokens } from "@/src/features/search-bar/components/ComposerTokens";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { cn } from "@/src/utils/tailwind";

export function RuleFilterPills({
  filter,
  display = "compact",
}: {
  filter: FilterState;
  display?: "compact" | "search-bar";
}) {
  if (display === "search-bar") {
    const query = filterStateToQueryText(filter, {}, RULE_FIELD_REGISTRY);
    const hasFilters = Boolean(query.text || query.skippedFilters.length > 0);

    return (
      <div
        aria-disabled="true"
        data-testid="readonly-rule-filter-search"
        className={cn(COMPOSER_SURFACE_CLASSES, "bg-muted/30")}
      >
        <div className={COMPOSER_TEXT_CLASSES}>
          {query.text ? (
            <ComposerTokens
              draft={query.text}
              showDiagnostics={false}
              registry={RULE_FIELD_REGISTRY}
            />
          ) : null}
          <InlineFilterState
            filterState={query.skippedFilters}
            className="m-0"
          />
          {!hasFilters ? (
            <span className="text-muted-foreground">No filters</span>
          ) : null}
        </div>
      </div>
    );
  }

  if (filter.length === 0) {
    return <span className="text-muted-foreground text-sm">No filters</span>;
  }

  const items = filter.map((condition, index) => ({
    condition,
    key: `${index}-${JSON.stringify(condition)}`,
  }));

  return (
    <SingleLineOverflowList
      items={items}
      additionalOverflowCount={0}
      getKey={(item) => item.key}
      renderItem={(item) => (
        <InlineFilterState filterState={[item.condition]} className="m-0" />
      )}
      renderOverflow={({ overflowItemCount }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" size="sm" className="font-normal">
              +{overflowItemCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-96">
            <div className="flex flex-wrap gap-1">
              <InlineFilterState filterState={filter} className="m-0" />
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    />
  );
}
