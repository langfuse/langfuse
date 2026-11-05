import { coerceLegacyEmptyMetadataFilters } from "../interfaces/filters";
import {
  TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
  type TracingSearchType,
} from "../interfaces/search";
import type { EventsTableFilterCondition, FilterCondition } from "../types";
import {
  conjuncts,
  type Predicate,
  type PredicateAnd,
  type PredicateCondition,
  type PredicateSearch,
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

/**
 * Reads a flat `FilterState` plus the free-text lane into a predicate:
 * `and(...conditions, search?)`. Applies the legacy read coercions
 * (`contains ""` on metadata reads as `is set`; a missing `searchType` reads
 * as the `id` scope, which is what the search SQL does with it).
 */
export const fromFilterState = ({
  filter,
  searchQuery,
  searchType,
}: FilterStateWithSearch): PredicateAnd => {
  const coerced = coerceLegacyEmptyMetadataFilters(
    filter,
  ) as FilterStateCondition[];
  const children: Predicate[] = coerced.map(conditionFromFilter);

  if (searchQuery) {
    if (searchType?.length === 0) {
      throw new Error(TRACING_SEARCH_TYPE_REQUIRED_MESSAGE);
    }
    children.push({
      kind: "search",
      text: searchQuery,
      scopes: searchType ?? ["id"],
    });
  }

  return { kind: "and", children };
};

/**
 * Writes a predicate back to `FilterState` plus the free-text lane. Only
 * conjunctions of conditions with at most one search leaf are representable;
 * anything else throws `PredicateNotRepresentableError`.
 */
export const toFilterState = (predicate: Predicate): FilterStateWithSearch => {
  const filter: FilterStateCondition[] = [];
  let search: PredicateSearch | undefined;

  for (const node of conjuncts(predicate)) {
    switch (node.kind) {
      case "condition":
        filter.push(filterFromCondition(node));
        break;
      case "search":
        if (search) {
          throw new PredicateNotRepresentableError("more than one search");
        }
        search = node;
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
