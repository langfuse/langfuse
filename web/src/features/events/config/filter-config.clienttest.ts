import {
  eventsTableCols,
  observationsTableCols,
  tracesTableCols,
} from "@langfuse/shared";
import { normalizeFilterColumnNames } from "@/src/features/filters/lib/filter-transform";
import { observationFilterConfig } from "@/src/features/filters/config/observations-config";
import { traceFilterConfig } from "@/src/features/filters/config/traces-config";
import {
  getEventsColumnName,
  observationEventsFilterConfig,
} from "@/src/features/events/config/filter-config";

describe("observation status display name", () => {
  it("uses Status for both the table column and the sidebar filter", () => {
    expect(getEventsColumnName("level")).toBe("Status");
    expect(
      observationEventsFilterConfig.facets.find(
        (facet) => facet.column === "level",
      )?.label,
    ).toBe("Status");
    expect(
      observationsTableCols.find((column) => column.id === "level")?.name,
    ).toBe("Status");
    expect(
      observationFilterConfig.facets.find((facet) => facet.column === "level")
        ?.label,
    ).toBe("Status");
    expect(tracesTableCols.find((column) => column.id === "level")?.name).toBe(
      "Status",
    );
    expect(
      traceFilterConfig.facets.find((facet) => facet.column === "level")?.label,
    ).toBe("Status");
  });

  it("still resolves saved filters that address the column as Level", () => {
    for (const columns of [
      eventsTableCols,
      observationsTableCols,
      tracesTableCols,
    ]) {
      const [normalized] = normalizeFilterColumnNames(
        [
          {
            column: "Level",
            type: "stringOptions",
            operator: "any of",
            value: ["ERROR"],
          },
        ],
        columns,
      );

      expect(normalized?.column).toBe("level");
    }
  });
});
