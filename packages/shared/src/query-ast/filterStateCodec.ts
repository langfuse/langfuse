import { coerceLegacyEmptyMetadataFilters } from "../interfaces/filters";
import {
  TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
  type TracingSearchType,
} from "../interfaces/search";
import type { EventsTableFilterCondition, FilterCondition } from "../types";
import {
  conjuncts,
  type PredicateAnd,
  type PredicateCondition,
  type PredicateSearch,
  type PredicateWithSearch,
} from "./predicate";

/** A `FilterState` condition, including the events-table `matches` variant. */
export type FilterStateCondition = FilterCondition | EventsTableFilterCondition;

/**
 * A flat `FilterState` plus the free-text lane, as stored and sent today.
 * `null` search fields come from callers that read nullable columns.
 */
export type FilterStateWithSearch = {
  filter: FilterStateCondition[];
  searchQuery?: string | null;
  searchType?: TracingSearchType[] | null;
};

export class PredicateNotRepresentableError extends Error {
  constructor(reason: string) {
    super(`Predicate cannot be written as FilterState: ${reason}`);
    this.name = "PredicateNotRepresentableError";
  }
}

const withTarget = (filter: FilterStateCondition) =>
  "target" in filter && filter.target !== undefined
    ? { target: filter.target }
    : {};

const conditionFromFilter = (
  filter: FilterStateCondition,
): PredicateCondition => {
  const base = { kind: "condition" as const, ...withTarget(filter) };
  switch (filter.type) {
    case "datetime":
    case "string":
    case "number":
    case "stringOptions":
    case "arrayOptions":
    case "boolean":
      return {
        ...base,
        type: filter.type,
        field: { id: filter.column },
        op: filter.operator,
        value: filter.value,
      } as PredicateCondition;
    case "categoryOptions":
    case "stringObject":
    case "numberObject":
    case "booleanObject":
      return {
        ...base,
        type: filter.type,
        field: { id: filter.column, key: filter.key },
        op: filter.operator,
        value: filter.value,
      } as PredicateCondition;
    case "null":
      return {
        ...base,
        type: "null",
        field: { id: filter.column },
        op: filter.operator,
      };
    case "positionInTrace":
      return {
        ...base,
        type: "positionInTrace",
        field: { id: filter.column, key: filter.key },
        op: filter.operator,
        ...(filter.value !== undefined ? { value: filter.value } : {}),
      };
  }
};

const filterFromCondition = (
  condition: PredicateCondition,
): FilterStateCondition => {
  const base =
    condition.target !== undefined ? { target: condition.target } : {};
  switch (condition.type) {
    case "datetime":
    case "string":
    case "number":
    case "stringOptions":
    case "arrayOptions":
    case "boolean":
      return {
        ...base,
        type: condition.type,
        column: condition.field.id,
        operator: condition.op,
        value: condition.value,
      } as FilterStateCondition;
    case "categoryOptions":
    case "stringObject":
    case "numberObject":
    case "booleanObject":
      return {
        ...base,
        type: condition.type,
        column: condition.field.id,
        key: condition.field.key,
        operator: condition.op,
        value: condition.value,
      } as FilterStateCondition;
    case "null":
      return {
        ...base,
        type: "null",
        column: condition.field.id,
        operator: condition.op,
        value: "",
      };
    case "positionInTrace":
      return {
        ...base,
        type: "positionInTrace",
        column: condition.field.id,
        key: condition.field.key,
        operator: condition.op,
        ...(condition.value !== undefined ? { value: condition.value } : {}),
      };
  }
};

// A missing `searchType` reads as the `id` scope, which is what the search
// SQL does with it; an empty one cannot be searched.
const searchFromFilterState = (
  searchQuery: FilterStateWithSearch["searchQuery"],
  searchType: FilterStateWithSearch["searchType"],
): PredicateSearch | undefined => {
  if (!searchQuery) return undefined;
  if (searchType?.length === 0) {
    throw new Error(TRACING_SEARCH_TYPE_REQUIRED_MESSAGE);
  }
  return { text: searchQuery, scopes: searchType ?? ["id"] };
};

/**
 * Reads a flat `FilterState` plus the free-text lane into
 * `{ predicate: and(...conditions), search? }`. Applies the legacy read
 * coercions (`contains ""` on metadata reads as `is set`; a missing
 * `searchType` reads as the `id` scope, which is what the search SQL does
 * with it).
 */
export const fromFilterState = ({
  filter,
  searchQuery,
  searchType,
}: FilterStateWithSearch): {
  predicate: PredicateAnd;
  search?: PredicateSearch;
} => {
  const coerced = coerceLegacyEmptyMetadataFilters(
    filter,
  ) as FilterStateCondition[];
  const predicate: PredicateAnd = {
    kind: "and",
    children: coerced.map(conditionFromFilter),
  };

  const search = searchFromFilterState(searchQuery, searchType);
  return search ? { predicate, search } : { predicate };
};

/**
 * Writes a predicate back to `FilterState` plus the free-text lane. Only
 * conjunctions of conditions are representable; an `or` or `not` throws
 * `PredicateNotRepresentableError`.
 */
export const toFilterState = ({
  predicate,
  search,
}: PredicateWithSearch): FilterStateWithSearch => {
  const filter: FilterStateCondition[] = [];

  for (const node of conjuncts(predicate)) {
    switch (node.kind) {
      case "condition":
        filter.push(filterFromCondition(node));
        break;
      case "or":
      case "not":
        throw new PredicateNotRepresentableError(`'${node.kind}' node`);
    }
  }

  return search
    ? { filter, searchQuery: search.text, searchType: search.scopes }
    : { filter };
};
