import {
  eventsTableCols,
  getCachedInputCost,
  getCachedInputMetric,
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

describe("cached input metrics", () => {
  it("sums cache-read buckets and excludes cache creation", () => {
    expect(
      getCachedInputMetric({
        input_cached_tokens: 20,
        cache_read_input_tokens: 22,
        input_cache_creation: 100,
      }),
    ).toBe(42);
  });

  it("distinguishes missing cached metrics from explicit zero values", () => {
    expect(getCachedInputMetric()).toBeUndefined();
    expect(getCachedInputCost()).toBeUndefined();
    expect(getCachedInputCost({ input_cache_creation: 0.01 })).toBeUndefined();
    expect(getCachedInputMetric({ input_cached_tokens: 0 })).toBe(0);
    expect(getCachedInputCost({ input_cached_tokens: 0 })).toBe(0);
    expect(getCachedInputCost({ input_cached_tokens: 0.004 })).toBe(0.004);
  });

  it("matches cache-read keys case-insensitively", () => {
    expect(getCachedInputMetric({ INPUT_CACHED_TOKENS: 5 })).toBe(5);
  });

  it("exposes cached token and cost columns as numeric sidebar facets", () => {
    expect(getEventsColumnName("cachedInputTokens")).toBe(
      "Cached Input Tokens",
    );
    expect(getEventsColumnName("cachedInputCost")).toBe(
      "Cached Input Cost ($)",
    );

    for (const column of ["cachedInputTokens", "cachedInputCost"]) {
      expect(
        observationEventsFilterConfig.facets.find(
          (facet) => facet.column === column,
        ),
      ).toMatchObject({ type: "numeric" });
    }
  });
});
