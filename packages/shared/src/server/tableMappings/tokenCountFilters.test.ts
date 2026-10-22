import { describe, expect, it } from "vitest";

import { type UiColumnMappings } from "../../tableDefinitions";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { eventsTableUiColumnDefinitions } from "./mapEventsTable";
import { observationsTableUiColumnDefinitions } from "./mapObservationsTable";
import { sessionCols } from "./mapSessionTable";
import { tracesTableUiColumnDefinitions } from "./mapTracesTable";

// usage_details is Map(String, UInt64). A Decimal64(3) comparison scales each
// stored count into Int64 and throws DECIMAL_OVERFLOW above ~9.2e15.
const isUsageCountSelect = (select: string) =>
  /usage_details|session_(input|output|total)_usage/.test(select) &&
  !select.includes("/");

const tables: { name: string; columns: UiColumnMappings }[] = [
  { name: "events", columns: eventsTableUiColumnDefinitions },
  { name: "observations", columns: observationsTableUiColumnDefinitions },
  { name: "traces", columns: tracesTableUiColumnDefinitions },
  { name: "sessions", columns: sessionCols },
];

describe("token count filters", () => {
  it.each(tables)(
    "compares $name usage counts as Float64 so huge UInt64 values do not overflow",
    ({ columns }) => {
      const tokenColumns = columns.filter((column) =>
        isUsageCountSelect(column.clickhouseSelect),
      );
      expect(tokenColumns.length).toBeGreaterThan(0);

      for (const column of tokenColumns) {
        const [filter] = createFilterFromFilterState(
          [
            {
              column: column.uiTableId,
              type: "number",
              operator: ">",
              value: 1.5,
            },
          ],
          columns,
        );
        const applied = filter.apply();

        expect(applied.query).toContain(column.clickhouseSelect);
        expect(applied.query).toContain(": Float64}");
        expect(applied.query).not.toContain("Decimal");
        expect(Object.values(applied.params)).toEqual(["1.5"]);
      }
    },
  );

  it.each(tables)(
    "keeps $name duration filters on Decimal64(3)",
    ({ columns }) => {
      const durationColumns = columns.filter((column) =>
        ["latency", "timeToFirstToken", "sessionDuration"].includes(
          column.uiTableId,
        ),
      );

      expect(durationColumns.length).toBeGreaterThan(0);
      for (const column of durationColumns) {
        expect(column.clickhouseTypeOverwrite).toBe("Decimal64(3)");
      }
    },
  );
});
