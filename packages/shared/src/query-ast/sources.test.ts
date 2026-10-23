import { describe, expect, it } from "vitest";
import { eventsTableCols } from "../eventsTable";
import { filterOperators, FTS_MATCH_OPERATOR } from "../interfaces/filters";
import { TracingSearchType } from "../interfaces/search";
import { eventSearchCondition } from "../server/queries/clickhouse-sql/events-observation-row-selection";
import { COMPATIBLE_FILTER_TYPES } from "../server/queries/clickhouse-sql/filterTypeCompatibility";
import {
  isFtsMetadataTarget,
  isFtsTextTarget,
} from "../server/queries/clickhouse-sql/fts";
import { eventsTableUiColumnDefinitions } from "../server/tableMappings/mapEventsTable";
import {
  findUiColumnMapping,
  type ColumnDefinition,
} from "../tableDefinitions/types";
import { resolvePredicateSourceField, eventsPredicateSource } from "./sources";

// Column mappings the legacy builder accepts that the registry does not
// declare yet; `scores` resolves per filter type rather than to one field.
const UNREGISTERED_EVENTS_MAPPINGS = [
  "parentObservationId",
  "skillFilesLoaded",
  "skillNames",
  "skillVersions",
  "scores",
];

const mappingSelect = (column: string) => {
  const mapping = findUiColumnMapping(eventsTableUiColumnDefinitions, column);
  if (!mapping) return undefined;
  const select = mapping.clickhouseSelect.replaceAll('"', "");
  return mapping.queryPrefix ? `${mapping.queryPrefix}.${select}` : select;
};

describe("events source registry", () => {
  it("declares exactly the eventsTableCols fields", () => {
    expect(eventsPredicateSource.fields.map((f) => f.id)).toEqual(
      eventsTableCols.map((c) => c.id),
    );
  });

  it.each(eventsTableCols.map((col) => [col.id, col] as const))(
    "%s matches eventsTableCols",
    (id, col) => {
      const field = resolvePredicateSourceField(eventsPredicateSource, id)!;
      expect(field.label).toBe(col.name);
      expect(field.type).toBe(col.type);
      expect(field.aliases).toEqual(
        expect.arrayContaining((col as ColumnDefinition).aliases ?? []),
      );
      expect(Object.keys(field.operators)).toEqual(
        COMPATIBLE_FILTER_TYPES[col.type],
      );
    },
  );

  it("offers each condition type's operators, plus `matches` on FTS targets", () => {
    for (const field of eventsPredicateSource.fields) {
      const mapping = findUiColumnMapping(
        eventsTableUiColumnDefinitions,
        field.id,
      )!;
      for (const [conditionType, operators] of Object.entries(
        field.operators,
      )) {
        const supportsMatches =
          (conditionType === "string" &&
            isFtsTextTarget(
              mapping.clickhouseTableName,
              mapping.clickhouseSelect,
              FTS_MATCH_OPERATOR,
            )) ||
          (conditionType === "stringObject" &&
            isFtsMetadataTarget(
              mapping.clickhouseTableName,
              mapping.clickhouseSelect,
            ));
        expect(operators).toEqual([
          ...filterOperators[conditionType as keyof typeof filterOperators],
          ...(supportsMatches ? [FTS_MATCH_OPERATOR] : []),
        ]);
      }
    }
  });

  it("gives every column spelling a single owner", () => {
    const spellings = eventsPredicateSource.fields.flatMap((f) => [
      f.id,
      f.label,
      ...f.aliases,
    ]);
    expect(new Set(spellings).size).toBe(spellings.length);
  });

  it("resolves every legacy column mapping to the field with the same SQL", () => {
    for (const mapping of eventsTableUiColumnDefinitions) {
      if (UNREGISTERED_EVENTS_MAPPINGS.includes(mapping.uiTableId)) continue;
      for (const spelling of [
        mapping.uiTableId,
        mapping.uiTableName,
        ...(mapping.aliases ?? []),
      ]) {
        const field = resolvePredicateSourceField(
          eventsPredicateSource,
          spelling,
        );
        expect(field, spelling).toBeDefined();
        expect(mappingSelect(field!.id), spelling).toBe(
          mappingSelect(spelling),
        );
      }
    }
  });

  it("lists only mappings the registry really lacks as unregistered", () => {
    for (const id of UNREGISTERED_EVENTS_MAPPINGS) {
      expect(mappingSelect(id), id).toBeDefined();
      expect(
        resolvePredicateSourceField(eventsPredicateSource, id),
        id,
      ).toBeUndefined();
    }
  });

  it.each(TracingSearchType.options.map((scope) => [scope]))(
    "search scope %s matches the events search SQL",
    (scope) => {
      const { query } = eventSearchCondition({
        query: "needle",
        searchType: [scope],
      });
      const columns = new Set(
        [...query.matchAll(/\be\.(\w+)/g)].map((m) => m[1]),
      );
      expect([...columns].sort()).toEqual(
        [...eventsPredicateSource.searchScopes[scope]].sort(),
      );
    },
  );
});
