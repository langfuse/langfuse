import type { FilterState } from "@langfuse/shared";

import type { VisualizationDefinition } from "../types";

const filterTokens = (
  filters: FilterState,
  entity: VisualizationDefinition["match"]["entity"],
) => {
  if (filters.length === 0) {
    return entity === "TRACE"
      ? [{ column: "isRootObservation", syntax: ":", value: "true" }]
      : [{ column: "all", syntax: ":", value: "observations" }];
  }

  return filters.map((filter) => {
    const value = Array.isArray(filter.value)
      ? filter.value.join(",")
      : String(filter.value ?? "");
    let syntax: string = filter.operator;
    if (filter.operator === "=" || filter.operator === "any of") syntax = ":";
    if (filter.operator === "<>" || filter.operator === "none of") {
      syntax = "!:";
    }
    if (filter.operator === "contains") syntax = "~";
    return { column: filter.column, syntax, value };
  });
};

export function VisualizationFilterTokens({
  filters,
  entity,
  variant = "summary",
}: {
  filters: FilterState;
  entity: VisualizationDefinition["match"]["entity"];
  variant?: "summary" | "card";
}) {
  return (
    <span
      className={`flex min-h-8 flex-wrap items-center gap-1.5 ${variant === "card" ? "mt-4" : "mt-1"}`}
    >
      {filterTokens(filters, entity).map((token) => (
        <span
          key={`${token.column}-${token.syntax}-${token.value}`}
          className="bg-muted/40 rounded-md px-2 py-1 font-mono text-xs"
        >
          <span className="text-primary">{token.column}</span>
          <span className="text-muted-foreground">{token.syntax}</span>
          <span className="text-emerald-400">{token.value}</span>
        </span>
      ))}
    </span>
  );
}
