import { useMemo } from "react";
import { type FilterState } from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";

export function useSessionFilterPreview(
  traces: RouterOutputs["sessions"]["previewTree"] | undefined,
  filters: FilterState,
) {
  return useMemo(
    () =>
      traces?.map((trace) => {
        const observations = trace.observations.map((observation) => ({
          ...observation,
          matches: filters.every((filter) => {
            if (
              filter.column === "isRootObservation" &&
              filter.type === "boolean"
            ) {
              const equal =
                (observation.isRootObservation === true) === filter.value;
              switch (filter.operator) {
                case "=":
                  return equal;
                case "<>":
                  return !equal;
                default:
                  throw new Error(
                    `Unsupported boolean filter: ${filter satisfies never}`,
                  );
              }
            }
            if (
              filter.type === "arrayOptions" &&
              filter.column === "traceTags"
            ) {
              const tags = observation.traceTags ?? [];
              switch (filter.operator) {
                case "all of":
                  return filter.value.every((tag) => tags.includes(tag));
                case "any of":
                  return filter.value.some((tag) => tags.includes(tag));
                case "none of":
                  return !filter.value.some((tag) => tags.includes(tag));
                default:
                  throw new Error(
                    `Unsupported tag filter: ${filter satisfies never}`,
                  );
              }
            }
            if (
              filter.type !== "string" &&
              filter.type !== "stringOptions" &&
              filter.type !== "stringObject"
            )
              return false;
            const value = (() => {
              if (
                filter.type === "stringObject" &&
                filter.column === "metadata"
              ) {
                const metadata = observation.metadata;
                if (
                  !metadata ||
                  typeof metadata !== "object" ||
                  Array.isArray(metadata)
                )
                  return undefined;
                const entry = metadata[filter.key];
                if (entry === undefined || entry === null) return undefined;
                return typeof entry === "string"
                  ? entry
                  : JSON.stringify(entry);
              }
              if (filter.column === "name") return observation.name;
              if (filter.column === "traceName") return trace.name;
              if (filter.column === "type") return observation.type;
              if (filter.column === "level") return observation.level;
              if (filter.column === "userId") return observation.userId;
              if (filter.column === "environment")
                return observation.environment;
              return undefined;
            })();
            if (filter.operator === "is set")
              return value !== undefined && value !== null;
            if (filter.operator === "is not set")
              return value === undefined || value === null;
            if (value === null || value === undefined) return false;
            if (filter.type === "stringOptions") {
              const included = filter.value.includes(value);
              switch (filter.operator) {
                case "any of":
                  return included;
                case "none of":
                  return !included;
                default:
                  throw new Error(
                    `Unsupported name filter: ${filter satisfies never}`,
                  );
              }
            }
            if (filter.operator === "=") return value === filter.value;
            if (filter.operator === "is not empty") return value.length > 0;
            if (filter.operator === "starts with")
              return value.startsWith(filter.value);
            if (filter.operator === "ends with")
              return value.endsWith(filter.value);
            const contains = value.includes(filter.value);
            if (filter.operator === "contains") return contains;
            if (filter.operator === "does not contain") return !contains;
            return false;
          }),
        }));
        return {
          ...trace,
          observations,
          matches:
            filters.length === 0 ||
            observations.some((observation) => observation.matches),
        };
      }),
    [traces, filters],
  );
}
